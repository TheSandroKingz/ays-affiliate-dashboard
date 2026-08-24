import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { BOTS } from "@/lib/bots";

// Estado de los 3 bots de Telegram en una sola vista (solo admin): el de Sandro
// (tablas telegram_*) y los nuevos Jeffer/Alana (tablas bot_*). Por bot: contactos
// activos, quién escribió/entró en 24h, gasto de IA de hoy vs tope, y los
// depósitos que trae (por su afp). El admin solo veía el de Sandro; ahora los tres.
const TOPE_IA = 5000;

export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const hoyKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  // Inicio del día de HOY en Madrid, en instante UTC (para "escribieron/nuevos
  // hoy" = día natural de Madrid, no una ventana rodante de 24h).
  const offMadrid = Number(
    (
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Madrid",
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? "GMT+0"
    ).match(/GMT([+-]\d+)/)?.[1] ?? "0"
  );
  const inicioHoy = Date.parse(hoyKey + "T00:00:00Z") - offMadrid * 3600_000;

  // Los 3 bots: Sandro + los del registro (Jeffer, Alana). afp único por bot.
  const defs = [
    { key: "sandro", label: "A&S", username: "Mongolitos", afp: "bot", token: true, enlace: true },
    ...Object.values(BOTS).map((b) => ({
      key: b.key,
      label: b.label,
      username: b.username,
      afp: b.afp,
      token: !!b.token,
      enlace: !!b.enlace,
    })),
  ];
  const afps = defs.map((d) => d.afp);

  const [
    tgContacts,
    botContacts,
    tgAi,
    botAi,
    tgConfig,
    botConfig,
    comms,
    deps,
    regs,
    tgMsgCount,
    botMsgs,
    meCpa,
  ] = await Promise.all([
      supabaseAdmin
        .from("telegram_contacts")
        .select("opted_out, silenced, last_msg_at, joined_at")
        .limit(100000),
      supabaseAdmin
        .from("bot_contacts")
        .select("bot, opted_out, silenced, last_msg_at, joined_at")
        .limit(100000),
      supabaseAdmin.from("telegram_ai_daily").select("count").eq("day", hoyKey).maybeSingle(),
      supabaseAdmin.from("bot_ai_daily").select("bot, count").eq("day", hoyKey),
      supabaseAdmin.from("telegram_config").select("promo").eq("id", 1).maybeSingle(),
      supabaseAdmin.from("bot_config").select("bot, promo").limit(100),
      supabaseAdmin
        .from("postback_events")
        .select("afp, commission")
        .eq("counted", true)
        .eq("event_type", "commission")
        .in("afp", afps)
        .limit(100000),
      // Depósitos con importe (Celsius sí manda el amount): primeros depósitos y
      // recargas. Sirve para contar recargas Y sumar la cantidad depositada.
      supabaseAdmin
        .from("postback_events")
        .select("afp, amount, event_type")
        .in("event_type", ["ftd", "redeposit"])
        .in("afp", afps)
        .limit(100000),
      // Registros atribuidos a cada bot (por su afp).
      supabaseAdmin
        .from("postback_events")
        .select("afp")
        .eq("event_type", "registration")
        .eq("counted", true)
        .in("afp", afps)
        .limit(100000),
      // Mensajes totales guardados: head counts (NO traer toda la tabla).
      supabaseAdmin
        .from("telegram_messages")
        .select("id", { count: "exact", head: true }),
      Promise.all(
        Object.values(BOTS).map((b) =>
          supabaseAdmin
            .from("bot_messages")
            .select("id", { count: "exact", head: true })
            .eq("bot", b.key)
            .then((r) => [b.key, r.count ?? 0] as [string, number])
        )
      ),
      // Tu CPA (el que te paga Celsius). Sirve para calcular TU margen por afiliado.
      supabaseAdmin.from("affiliates").select("cpa_spain").eq("user_id", user.id).maybeSingle(),
    ]);

  // Tu CPA propio. Con él, "lo que ganas TÚ" por un bot de afiliado = tu CPA × QFTD
  // − lo que cobra el afiliado (mismo criterio que el panel de admin, adminStats.ts).
  const adminCpa = Number(meCpa?.data?.cpa_spain ?? 0);

  type Contacto = {
    opted_out: boolean | null;
    silenced: boolean | null;
    last_msg_at: string | null;
    joined_at: string | null;
  };
  const hace3d = Date.now() - 3 * 864e5;
  const contactStats = (rows: Contacto[]) => {
    let activos = 0, total = 0, escribieron = 0, nuevos = 0, bajas = 0, dormidos = 0;
    for (const c of rows) {
      total++;
      const act = !c.opted_out && !c.silenced;
      if (act) activos++;
      if (c.opted_out) bajas++;
      // "Hoy" = desde el inicio del día en Madrid.
      if (c.last_msg_at && new Date(c.last_msg_at).getTime() >= inicioHoy) escribieron++;
      if (c.joined_at && new Date(c.joined_at).getTime() >= inicioHoy) nuevos++;
      // Dormido = activo pero sin escribir en 3+ días (candidato a reactivar).
      if (act && (!c.last_msg_at || new Date(c.last_msg_at).getTime() < hace3d)) dormidos++;
    }
    return { activos, total, escribieron, nuevos, bajas, dormidos };
  };

  const sandroContacts = (tgContacts.data ?? []) as Contacto[];
  const botContactsByBot = new Map<string, Contacto[]>();
  for (const c of (botContacts.data ?? []) as (Contacto & { bot: string })[]) {
    const arr = botContactsByBot.get(c.bot) ?? [];
    arr.push(c);
    botContactsByBot.set(c.bot, arr);
  }
  const aiByBot = new Map((botAi.data ?? []).map((r) => [r.bot, Number(r.count ?? 0)]));
  const promoByBot = new Map((botConfig.data ?? []).map((r) => [r.bot, r.promo]));

  const qftd = new Map<string, number>();
  const ganado = new Map<string, number>();
  for (const e of comms.data ?? []) {
    qftd.set(e.afp, (qftd.get(e.afp) ?? 0) + 1);
    ganado.set(e.afp, (ganado.get(e.afp) ?? 0) + Number(e.commission ?? 0));
  }
  const recargas = new Map<string, number>();
  const depositado = new Map<string, number>();
  for (const e of deps.data ?? []) {
    // El importe se suma SOLO de los "redeposit": el postback de depósito de
    // Celsius salta también en el 1er depósito, así que sumar el importe de ftd Y
    // redeposit contaría DOS VECES el primer depósito (mismo criterio que el resto
    // del panel). El nº de recargas también son los redeposit.
    if (e.event_type === "redeposit") {
      recargas.set(e.afp, (recargas.get(e.afp) ?? 0) + 1);
      depositado.set(e.afp, (depositado.get(e.afp) ?? 0) + Number(e.amount ?? 0));
    }
  }
  const registros = new Map<string, number>();
  for (const e of regs.data ?? []) {
    registros.set(e.afp, (registros.get(e.afp) ?? 0) + 1);
  }
  // Mensajes totales por bot (head counts).
  const msgsByBot = new Map<string, number>(botMsgs);
  const mensajesSandro = tgMsgCount.count ?? 0;

  const bots = defs.map((d) => {
    const cs =
      d.key === "sandro"
        ? contactStats(sandroContacts)
        : contactStats(botContactsByBot.get(d.key) ?? []);
    const ia = d.key === "sandro" ? Number(tgAi.data?.count ?? 0) : aiByBot.get(d.key) ?? 0;
    const promo =
      d.key === "sandro" ? tgConfig.data?.promo ?? "" : promoByBot.get(d.key) ?? "";
    const qftdBot = qftd.get(d.afp) ?? 0;
    const comisionAfiliado = ganado.get(d.afp) ?? 0; // lo que cobra el AFILIADO (su CPA)
    // "has ganado" = lo que te quedas TÚ. Para tu cuenta propia (afp "bot" =
    // Mongolitos) es la comisión entera (el dinero es tuyo). Para un bot de AFILIADO,
    // tu margen = tu CPA × QFTD − lo que cobra el afiliado (idéntico a adminStats.ts).
    const tuyo = d.afp === "bot" ? comisionAfiliado : adminCpa * qftdBot - comisionAfiliado;
    return {
      key: d.key,
      label: d.label,
      username: d.username,
      configurado: d.token && d.enlace,
      ...cs,
      ia,
      topeIa: TOPE_IA,
      registros: registros.get(d.afp) ?? 0,
      qftd: qftdBot,
      ganado: tuyo, // lo que te quedas tú (margen), NO el CPA del afiliado
      comisionAfiliado, // lo que cobra el afiliado (por si se quiere mostrar aparte)
      recargas: recargas.get(d.afp) ?? 0,
      depositado: depositado.get(d.afp) ?? 0,
      mensajes: d.key === "sandro" ? mensajesSandro : msgsByBot.get(d.key) ?? 0,
      promo: (promo ?? "").trim(),
    };
  });

  return NextResponse.json({ bots });
}
