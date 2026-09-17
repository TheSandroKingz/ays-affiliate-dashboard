import { contadorDeDepositos } from "@/lib/postback";
import { NextResponse } from "next/server";
import { traerTodo } from "@/lib/traerTodo";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { BOTS } from "@/lib/bots";

// Estado de los 3 bots de Telegram en una sola vista (solo admin): el de Sandro
// (tablas telegram_*) y los nuevos Jeffer/Alana (tablas bot_*). Por bot: contactos
// activos, quién escribió/entró en 24h, gasto de IA de hoy vs tope, y los
// depósitos que trae (por su afp). El admin solo veía el de Sandro; ahora los tres.
// Tope diario REAL de respuestas de IA (el del webhook). Estaba en 5.000, que no
// frenaba nada: con el coste real son más de 150 € en un día.
const TOPE_IA = 1500;

// Precios de Anthropic para el modelo de los bots ($ por millón de tokens).
// Con esto el panel dice lo que cuesta DE VERDAD, sin estimar.
const PRECIO = { entrada: 3, cacheLee: 0.3, cacheEscribe: 6, salida: 15 };
type UsoIA = { created_at: string; bot: string | null; entrada: number; cache_lee: number; cache_escribe: number; salida: number };
const costeDe = (r: UsoIA) =>
  (r.entrada * PRECIO.entrada + r.cache_lee * PRECIO.cacheLee + r.cache_escribe * PRECIO.cacheEscribe + r.salida * PRECIO.salida) / 1e6;
// En ia_uso/ia_fallos el bot de Sandro va como null o "as"; aquí su clave es "sandro".
const claveBot = (b: string | null | undefined) => (!b || b === "as" ? "sandro" : b);

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
    usoIa,
    fallosIa,
    negros,
  ] = await Promise.all([
      traerTodo<{ opted_out: boolean | null; silenced: boolean | null; last_msg_at: string | null; joined_at: string | null }>(
        (d, h) =>
          supabaseAdmin
            .from("telegram_contacts")
            .select("opted_out, silenced, last_msg_at, joined_at")
            .order("chat_id", { ascending: true })
            .range(d, h)
      ).then((data) => ({ data })),
      traerTodo<{ bot: string; opted_out: boolean | null; silenced: boolean | null; last_msg_at: string | null; joined_at: string | null }>(
        (d, h) =>
          supabaseAdmin
            .from("bot_contacts")
            .select("bot, opted_out, silenced, last_msg_at, joined_at")
            .order("chat_id", { ascending: true })
            .range(d, h)
      ).then((data) => ({ data })),
      supabaseAdmin.from("telegram_ai_daily").select("count").eq("day", hoyKey).maybeSingle(),
      supabaseAdmin.from("bot_ai_daily").select("bot, count").eq("day", hoyKey),
      supabaseAdmin.from("telegram_config").select("promo").eq("id", 1).maybeSingle(),
      supabaseAdmin.from("bot_config").select("bot, promo").limit(100),
      traerTodo<{ afp: string; commission: number | null }>((d, h) =>
        supabaseAdmin
          .from("postback_events")
          .select("afp, commission")
          .eq("counted", true)
          .eq("event_type", "commission")
          .in("afp", afps)
          .order("id", { ascending: true })
          .range(d, h)
      ).then((data) => ({ data })),
      // Depósitos con importe (Celsius sí manda el amount): primeros depósitos y
      // recargas. Sirve para contar recargas Y sumar la cantidad depositada.
      traerTodo<{ afp: string; amount: number | null; event_type: string; player_id: string | null; created_at: string }>(
        (d, h) =>
          supabaseAdmin
            .from("postback_events")
            .select("afp, amount, event_type, player_id, created_at")
            .in("event_type", ["ftd", "redeposit"])
            .in("afp", afps)
            .order("created_at", { ascending: true })
            .range(d, h)
      ).then((data) => ({ data })),
      // Registros atribuidos a cada bot (por su afp).
      traerTodo<{ afp: string }>((d, h) =>
        supabaseAdmin
          .from("postback_events")
          .select("afp")
          .eq("event_type", "registration")
          .eq("counted", true)
          .in("afp", afps)
          .order("id", { ascending: true })
          .range(d, h)
      ).then((data) => ({ data })),
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
      // Lo que cuesta la IA: del día 1 del mes hasta ahora (hoy sale de estas mismas
      // filas). Si la tabla aún no existe, se sigue sin coste.
      traerTodo<UsoIA>((d, h) =>
        supabaseAdmin
          .from("ia_uso")
          .select("created_at, bot, entrada, cache_lee, cache_escribe, salida")
          .gte("created_at", new Date(Date.parse(hoyKey.slice(0, 7) + "-01T00:00:00Z") - offMadrid * 3600_000).toISOString())
          .order("id", { ascending: true })
          .range(d, h)
      ).then((data) => ({ data })).catch(() => ({ data: [] as UsoIA[] })),
      // Mensajes de hoy que se quedaron SIN respuesta y por qué.
      supabaseAdmin
        .from("ia_fallos")
        .select("bot, chat_id, motivo, created_at")
        .gte("created_at", new Date(inicioHoy).toISOString())
        .order("created_at", { ascending: false })
        .limit(200),
      // Silenciados EN VIVO (los que siguen sin reactivar).
      supabaseAdmin
        .from("lista_negra")
        .select("bot, chat_id, motivo, created_at")
        .is("reactivado_at", null)
        .order("created_at", { ascending: false })
        .limit(60),
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
  const nuevoDeposito = contadorDeDepositos();
  const recargas = new Map<string, number>();
  const depositado = new Map<string, number>();
  for (const e of deps.data ?? []) {
    // El importe se suma SOLO de los "redeposit": el postback de depósito de
    // Celsius salta también en el 1er depósito, así que sumar el importe de ftd Y
    // redeposit contaría DOS VECES el primer depósito (mismo criterio que el resto
    // del panel). El nº de recargas también son los redeposit.
    if (e.event_type === "redeposit") {
      // ⚠️ Celsius manda un `redeposit` TAMBIÉN en el primer depósito, así que
      // contarlos todos infla el número: el bot de A&S decía 102 recargas
      // cuando eran 61. Solo es recarga si ya le habíamos visto depositar.
      const esRecarga = nuevoDeposito.yaTenia(e.player_id as string | null);
      // El amount de Celsius es ACUMULADO por jugador: solo sumamos lo NUEVO.
      const nuevo = nuevoDeposito(e.player_id as string | null, e.amount);
      if (esRecarga) recargas.set(e.afp, (recargas.get(e.afp) ?? 0) + 1);
      if (nuevo > 0) depositado.set(e.afp, (depositado.get(e.afp) ?? 0) + nuevo);
    }
  }
  const registros = new Map<string, number>();
  for (const e of regs.data ?? []) {
    registros.set(e.afp, (registros.get(e.afp) ?? 0) + 1);
  }
  // Mensajes totales por bot (head counts).
  const msgsByBot = new Map<string, number>(botMsgs);

  // Coste de la IA por bot: hoy y lo que va de mes.
  const costeHoy = new Map<string, number>();
  const costeMes = new Map<string, number>();
  for (const r of (usoIa.data ?? []) as UsoIA[]) {
    const k = claveBot(r.bot);
    const c = costeDe(r);
    costeMes.set(k, (costeMes.get(k) ?? 0) + c);
    if (Date.parse(r.created_at) >= inicioHoy) costeHoy.set(k, (costeHoy.get(k) ?? 0) + c);
  }
  // Mensajes de hoy sin respuesta, por bot (con el último motivo, para el panel).
  const fallosPorBot = new Map<string, { n: number; ultimo: string }>();
  for (const f of fallosIa.data ?? []) {
    const k = claveBot(f.bot as string | null);
    const prev = fallosPorBot.get(k);
    fallosPorBot.set(k, { n: (prev?.n ?? 0) + 1, ultimo: prev?.ultimo ?? String(f.motivo ?? "") });
  }
  // Silenciados: con su nombre, para poder reconocerlos y reactivarlos.
  const negrosRows = (negros.data ?? []) as { bot: string; chat_id: number; motivo: string | null; created_at: string }[];
  const nombres = new Map<string, string | null>();
  if (negrosRows.length) {
    const idsAs = negrosRows.filter((n) => n.bot === "as").map((n) => n.chat_id);
    const idsOtros = negrosRows.filter((n) => n.bot !== "as").map((n) => n.chat_id);
    const [nAs, nOtros] = await Promise.all([
      idsAs.length
        ? supabaseAdmin.from("telegram_contacts").select("chat_id, first_name").in("chat_id", idsAs)
        : Promise.resolve({ data: [] as { chat_id: number; first_name: string | null }[] }),
      idsOtros.length
        ? supabaseAdmin.from("bot_contacts").select("bot, chat_id, first_name").in("chat_id", idsOtros)
        : Promise.resolve({ data: [] as { bot: string; chat_id: number; first_name: string | null }[] }),
    ]);
    for (const c of nAs.data ?? []) nombres.set("as:" + c.chat_id, c.first_name);
    for (const c of (nOtros.data ?? []) as { bot: string; chat_id: number; first_name: string | null }[]) {
      nombres.set(c.bot + ":" + c.chat_id, c.first_name);
    }
  }
  const etiquetaBot = new Map(defs.map((d) => [d.key === "sandro" ? "as" : d.key, d.label]));
  const silenciados = negrosRows.map((n) => ({
    bot: n.bot,
    botLabel: etiquetaBot.get(n.bot) ?? n.bot,
    chat_id: n.chat_id,
    nombre: nombres.get(n.bot + ":" + n.chat_id) ?? null,
    motivo: n.motivo ?? "",
    desde: n.created_at,
  }));
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
      costeHoy: costeHoy.get(d.key) ?? 0,
      costeMes: costeMes.get(d.key) ?? 0,
      fallosHoy: fallosPorBot.get(d.key)?.n ?? 0,
      fallosMotivo: fallosPorBot.get(d.key)?.ultimo ?? "",
      promo: (promo ?? "").trim(),
    };
  });

  return NextResponse.json({
    bots,
    silenciados,
    coste: {
      hoy: [...costeHoy.values()].reduce((a, b) => a + b, 0),
      mes: [...costeMes.values()].reduce((a, b) => a + b, 0),
    },
  });
}
