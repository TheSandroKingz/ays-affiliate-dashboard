import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { computeAdminStats, type DailyRow, type StructRow } from "@/lib/adminStats";

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
  const [dailyRes, pendRes] = await Promise.all([
    supabaseAdmin
      .from("affiliate_daily_stats")
      .select("user_id, date, commission, clicks, registrations, ftd")
      .in("user_id", idsToLoad),
    supabaseAdmin
      .from("affiliates")
      .select("user_id", { count: "exact", head: true })
      .eq("approved", false),
  ]);
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

  return NextResponse.json({
    adminCpa,
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
