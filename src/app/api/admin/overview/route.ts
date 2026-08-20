import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { computeAdminStats, type DailyRow, type StructRow } from "@/lib/adminStats";
import { resumenSeguridad, saludFreshbet } from "@/lib/seguridad";

// Vista consolidada del INICIO del admin: mes en curso + mes pasado (para la
// comparativa "a estas alturas") + seguridad + solicitudes pendientes. La
// consulta de datos va ACOTADA a esos 2 meses (no todo el histórico), y todo lo
// independiente va en paralelo. Menos descarga y menos round-trips.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Rangos (zona Madrid). Se calculan ya para acotar la consulta a 2 meses.
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  const inicioMes = hoy.slice(0, 7) + "-01";
  // Instante UTC equivalente al inicio de mes EN MADRID. postback_events.created_at
  // es UTC; si filtráramos por "YYYY-MM-01" (medianoche UTC) perderíamos las
  // primeras ~2h del día 1 en hora Madrid. Restamos el offset de Madrid de ahora.
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
  const inicioMesUtc = new Date(
    Date.parse(inicioMes + "T00:00:00Z") - offMadrid * 3600_000
  ).toISOString();
  const [y, m] = hoy.split("-").map(Number);
  const finPrev = new Date(Date.UTC(y, m - 1, 1));
  finPrev.setUTCDate(0);
  const finMesPasado = finPrev.toISOString().slice(0, 10);
  const inicioMesPasado = finMesPasado.slice(0, 7) + "-01";

  // La estructura debe resolverse antes de la consulta diaria (define idsToLoad).
  const { data: structure, error: sErr } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, display_name, referred_by, subaffiliate_percent")
    .neq("user_id", user.id);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const structIds = (structure ?? []).map((s) => s.user_id);
  const idsToLoad = [user.id, ...structIds];

  // Todo lo demás en paralelo. La consulta diaria viene ACOTADA por fecha (mes
  // pasado en adelante); antes traía TODO el histórico en cada carga.
  const [meRes, histDailyRes, pendRes, seguridad, freshbet, paisesRes] =
    await Promise.all([
      supabaseAdmin
        .from("affiliates")
        .select("id, cpa_spain")
        .eq("user_id", user.id)
        .maybeSingle(),
      // TODO el histórico (sin acotar fecha) para el "Total generado". El mes en
      // curso ("Lo que me quedo") se saca filtrando este mismo array por fecha en
      // memoria (antes había una 2ª query idéntica solo acotada por fecha).
      supabaseAdmin
        .from("affiliate_daily_stats")
        .select("user_id, date, commission, clicks, registrations, ftd")
        .in("user_id", idsToLoad)
        .limit(100000), // sin límite PostgREST corta en 1000 → los totales saldrían cortos al crecer
      supabaseAdmin
        .from("affiliates")
        .select("user_id", { count: "exact", head: true })
        .eq("approved", false),
      resumenSeguridad(),
      saludFreshbet(),
      supabaseAdmin
        .from("postback_events")
        .select("isocountry")
        .in("event_type", ["ftd", "commission"])
        .eq("counted", true)
        // Solo el MES en curso (se reinicia cada mes, como el resto del panel), no
        // el histórico. Usamos el inicio de mes de Madrid en UTC (inicioMesUtc)
        // para no perder las primeras horas del día 1.
        .gte("created_at", inicioMesUtc)
        .limit(100000), // sin límite se cortaría en 1000 y el histograma saldría corto
    ]);

  const adminCpa = Number(meRes.data?.cpa_spain ?? 0);
  const meId = meRes.data?.id;

  // De dónde vienen los jugadores (países de los QFTD/FTD contados).
  const paisesMap = new Map<string, number>();
  for (const r of paisesRes.data ?? []) {
    const c = (r.isocountry || "").toUpperCase() || "??";
    paisesMap.set(c, (paisesMap.get(c) ?? 0) + 1);
  }
  const paises = [...paisesMap.entries()]
    .map(([code, n]) => ({ code, n }))
    .sort((a, b) => b.n - a.n);

  if (histDailyRes.error) {
    return NextResponse.json({ error: histDailyRes.error.message }, { status: 500 });
  }

  // El mes en curso/pasado sale del mismo histórico, filtrado por fecha (enRango
  // ya acota más adelante; esto solo evita traer la tabla dos veces).
  const all = (histDailyRes.data ?? [])
    .map((d) => ({ ...d, date: String(d.date).slice(0, 10) }))
    .filter((d) => d.date >= inicioMesPasado) as DailyRow[];
  const struct = (structure ?? []) as StructRow[];

  const enRango = (a: string, b: string) =>
    all.filter((d) => d.date >= a && d.date <= b);

  const mes = computeAdminStats(
    enRango(inicioMes, hoy),
    user.id,
    meId,
    adminCpa,
    struct
  );

  // Comparativa "a estas alturas": beneficio limpio del mes pasado hasta el
  // MISMO día del mes (para comparar con el actual de forma justa).
  const dia = Number(hoy.slice(8, 10));
  const finMesPasadoDia = Number(finMesPasado.slice(8, 10));
  const mismoDia = Math.min(dia, finMesPasadoDia);
  const lastMonthSameDay =
    inicioMesPasado.slice(0, 7) + "-" + String(mismoDia).padStart(2, "0");
  const lastMonthToDateClean = computeAdminStats(
    enRango(inicioMesPasado, lastMonthSameDay),
    user.id,
    meId,
    adminCpa,
    struct
  ).totals.totalClean;

  // Total generado HISTÓRICO (de todo el tiempo, aunque ya se haya cobrado): lo
  // que has ganado limpio desde el primer día. Como el afiliado, para el tooltip.
  const histRows = (histDailyRes.data ?? []).map((d) => ({
    ...d,
    date: String(d.date).slice(0, 10),
  })) as DailyRow[];
  const totalGenerado = computeAdminStats(
    histRows,
    user.id,
    meId,
    adminCpa,
    struct
  ).totals.totalClean;

  // (El REPARTO con el socio se calcula en su endpoint dedicado /api/admin/reparto,
  // que la página de Reparto usa. Aquí ya NO se duplica.)

  return NextResponse.json({
    adminCpa,
    seguridad,
    freshbet,
    lastMonthToDateClean,
    totalGenerado,
    paises,
    month: { stats: mes.stats, totals: mes.totals, daily: mes.daily },
    pending: pendRes.count ?? 0,
  });
}
