import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { telegramConfigurado } from "@/lib/telegram";

// GET: stats del bot para el panel (dinero generado, depósitos, comunidad, chats).
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const hace24h = new Date(Date.now() - 864e5).toISOString();
  const cuenta = (q: ReturnType<typeof filtroBase>) =>
    q.then((r) => r.count ?? 0);
  function filtroBase() {
    return supabaseAdmin
      .from("telegram_contacts")
      .select("chat_id", { count: "exact", head: true });
  }

  const hoyKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // Período para "lo que ha generado el bot": ?dia=YYYY-MM-DD (hoy/ayer),
  // ?mes=YYYY-MM (un mes) o nada = TOTAL de siempre. Devolvemos ambas cifras
  // (total + período) para que el panel las muestre según el selector.
  const url = new URL(request.url);
  const diaParam = url.searchParams.get("dia") || "";
  const mesParam = url.searchParams.get("mes") || "";
  let etiqueta = "Total";
  let desdeMs = 0;
  let hastaMs = Infinity;
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
  const madridStartUTC = (d: string) => Date.parse(d + "T00:00:00Z") - offMadrid * 3600_000;
  if (/^\d{4}-\d{2}-\d{2}$/.test(diaParam)) {
    desdeMs = madridStartUTC(diaParam);
    hastaMs = desdeMs + 864e5;
    etiqueta = diaParam === hoyKey ? "Hoy" : diaParam;
  } else if (/^\d{4}-\d{2}$/.test(mesParam)) {
    const [yy, mm] = mesParam.split("-").map(Number);
    desdeMs = madridStartUTC(`${mesParam}-01`);
    const finMes = new Date(Date.UTC(yy, mm, 1)).toISOString().slice(0, 10);
    hastaMs = madridStartUTC(finMes);
    etiqueta = mesParam;
  }
  const enPeriodo = (createdAt: string) => {
    if (hastaMs === Infinity) return true; // total
    const t = Date.parse(createdAt);
    return t >= desdeMs && t < hastaMs;
  };

  const [
    activos,
    total,
    bajas,
    silenciados,
    nuevos24h,
    escribieron24h,
    diarioRes,
    botRes,
    recRes,
    iaHoyRes,
    configRes,
  ] = await Promise.all([
    cuenta(filtroBase().eq("opted_out", false).eq("silenced", false)),
    cuenta(filtroBase()),
    cuenta(filtroBase().eq("opted_out", true)),
    cuenta(filtroBase().eq("silenced", true)),
    cuenta(filtroBase().gte("joined_at", hace24h)),
    cuenta(filtroBase().gte("last_msg_at", hace24h)),
    supabaseAdmin
      .from("telegram_daily")
      .select("media_type, enabled")
      .eq("id", 1)
      .maybeSingle(),
    // QFTD atribuidos al bot de SANDRO ya contados = lo que paga el CPA. OJO:
    // afp EXACTO "bot" (no "bot%"), si no incluiría los sub-bots botmn/botdm de
    // Jeffer/Alana e inflaría las cifras de ESTE panel con lo de ellos.
    // limit alto: sin él PostgREST corta en 1000 y las cifras se quedarían cortas.
    supabaseAdmin
      .from("postback_events")
      .select("commission, created_at")
      .eq("counted", true)
      .eq("event_type", "commission")
      .eq("afp", "bot")
      .limit(100000),
    // DEPÓSITOS del bot de Sandro (afp EXACTO "bot"): PRIMEROS depósitos (ftd) +
    // RECARGAS (redeposit). El nº de "Recargas" son solo los redeposit, y el
    // importe de "Dinero que metieron" se suma SOLO de las recargas (redeposit):
    // el postback de depósito salta también en el 1er depósito, así que sumar el
    // importe de ftd Y redeposit contaría dos veces el primer depósito.
    supabaseAdmin
      .from("postback_events")
      .select("amount, created_at, player_id, event_type")
      .in("event_type", ["ftd", "redeposit"])
      .eq("afp", "bot")
      .order("created_at", { ascending: false })
      .limit(100000),
    supabaseAdmin
      .from("telegram_ai_daily")
      .select("count")
      .eq("day", hoyKey)
      .maybeSingle(),
    supabaseAdmin
      .from("telegram_config")
      .select("promo")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  const diario = diarioRes.data;

  // El panel solo muestra TOTALES (no se reinician), así que sumamos sin más.
  // Antes se calculaban ventanas hoy/7d/30d creando un Intl.DateTimeFormat por
  // fila (carísimo); eran código muerto tras el rediseño del panel → fuera.
  // Total de siempre (nunca se reinicia) Y del período elegido (Hoy/Ayer/mes).
  const b = { depTot: 0, eurTot: 0, dep: 0, eur: 0 };
  for (const r of botRes.data ?? []) {
    const c = Number(r.commission ?? 0);
    b.depTot++;
    b.eurTot += c;
    if (enPeriodo(r.created_at as string)) {
      b.dep++;
      b.eur += c;
    }
  }
  // "Recargas" = nº de redeposit. "Dinero que metieron" = importe SOLO de las
  // recargas (redeposit), para no contar dos veces el primer depósito (que salta
  // como ftd Y como redeposit).
  const rec = { nTot: 0, eurTot: 0, n: 0, eur: 0 };
  for (const r of recRes.data ?? []) {
    if (r.event_type === "redeposit") {
      rec.nTot++;
      rec.eurTot += Number(r.amount ?? 0);
      if (enPeriodo(r.created_at as string)) {
        rec.n++;
        rec.eur += Number(r.amount ?? 0);
      }
    }
  }

  // Últimas recargas (solo redeposit, para verlas una a una con su importe).
  const recientes = (recRes.data ?? [])
    .filter((r) => r.event_type === "redeposit")
    .slice(0, 15)
    .map((r) => ({
      importe: Number(r.amount ?? 0),
      fecha: r.created_at as string,
      player: (r.player_id as string) ?? null,
    }));

  const iaHoy = iaHoyRes.data?.count ?? 0;
  const promo = configRes.data?.promo ?? "";

  return NextResponse.json({
    contactos: activos,
    configurado: telegramConfigurado(),
    stats: {
      activos,
      total,
      bajas,
      silenciados,
      nuevos24h,
      escribieron24h,
      iaHoy,
      bot: b,
      recargas: rec,
      recargasLista: recientes,
      etiqueta,
    },
    promo,
    diario: diario
      ? { activo: !!diario.enabled, tipo: diario.media_type ?? null }
      : null,
  });
}
