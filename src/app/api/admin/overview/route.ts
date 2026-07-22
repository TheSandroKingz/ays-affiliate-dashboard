import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { computeAdminStats, type DailyRow, type StructRow } from "@/lib/adminStats";
import { resumenSeguridad, saludFreshbet } from "@/lib/seguridad";

// Vista consolidada del INICIO del admin: mes en curso + mes pasado + histórico
// + solicitudes pendientes, todo con UNA sola consulta a affiliate_daily_stats
// (antes eran 3 llamadas separadas). Más rápido y menos carga.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: me } = await supabaseAdmin
    .from("affiliates")
    .select("id, cpa_spain")
    .eq("user_id", user.id)
    .maybeSingle();
  const adminCpa = Number(me?.cpa_spain ?? 0);

  const { data: structure, error: sErr } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, display_name, referred_by, subaffiliate_percent")
    .neq("user_id", user.id);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const structIds = (structure ?? []).map((s) => s.user_id);
  const idsToLoad = [user.id, ...structIds];

  // Una única consulta: todo el histórico. Los periodos se filtran en memoria.
  // La comprobación de seguridad va EN PARALELO (no en serie) para no frenar.
  const [dailyRes, pendRes, seguridad, freshbet, paisesRes] = await Promise.all([
    supabaseAdmin
      .from("affiliate_daily_stats")
      .select("user_id, date, commission, clicks, registrations, ftd")
      .in("user_id", idsToLoad),
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
      .eq("counted", true),
  ]);

  // De dónde vienen los jugadores (países de los QFTD/FTD contados).
  const paisesMap = new Map<string, number>();
  for (const r of paisesRes.data ?? []) {
    const c = (r.isocountry || "").toUpperCase() || "??";
    paisesMap.set(c, (paisesMap.get(c) ?? 0) + 1);
  }
  const paises = [...paisesMap.entries()]
    .map(([code, n]) => ({ code, n }))
    .sort((a, b) => b.n - a.n);
  if (dailyRes.error) {
    return NextResponse.json({ error: dailyRes.error.message }, { status: 500 });
  }

  const all = (dailyRes.data ?? []).map((d) => ({
    ...d,
    date: String(d.date).slice(0, 10),
  })) as DailyRow[];
  const struct = (structure ?? []) as StructRow[];

  // Rangos (zona Madrid).
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  const inicioMes = hoy.slice(0, 7) + "-01";
  const [y, m] = hoy.split("-").map(Number);
  const finPrev = new Date(Date.UTC(y, m - 1, 1));
  finPrev.setUTCDate(0);
  const finMesPasado = finPrev.toISOString().slice(0, 10);
  const inicioMesPasado = finMesPasado.slice(0, 7) + "-01";

  const enRango = (a: string, b: string) =>
    all.filter((d) => d.date >= a && d.date <= b);

  const mes = computeAdminStats(
    enRango(inicioMes, hoy),
    user.id,
    me?.id,
    adminCpa,
    struct
  );
  const mesPasado = computeAdminStats(
    enRango(inicioMesPasado, finMesPasado),
    user.id,
    me?.id,
    adminCpa,
    struct
  );
  const historico = computeAdminStats(all, user.id, me?.id, adminCpa, struct);

  // Afiliado del mes: el que más FTD te ha generado este mes.
  const top = [...mes.stats].filter((s) => s.ftd > 0).sort((a, b) => b.ftd - a.ftd)[0];
  const afiliadoDelMes = top ? { nombre: top.display_name, ftd: top.ftd } : null;

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
    me?.id,
    adminCpa,
    struct
  ).totals.totalClean;

  // Conversión global del negocio este mes (QFTD por clics).
  const conversionGlobal =
    mes.totals.clicks > 0 ? (mes.totals.ftd / mes.totals.clicks) * 100 : null;

  return NextResponse.json({
    adminCpa,
    seguridad,
    freshbet,
    afiliadoDelMes,
    lastMonthToDateClean,
    paises,
    conversionGlobal,
    month: { stats: mes.stats, totals: mes.totals, daily: mes.daily },
    lastMonthClean: mesPasado.totals.totalClean,
    allTime: {
      ftd: historico.totals.ftd,
      structurePaid: historico.totals.structurePaid,
      totalClean: historico.totals.totalClean,
    },
    pending: pendRes.count ?? 0,
  });
}
