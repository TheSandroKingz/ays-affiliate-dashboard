import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { computeAdminStats, type DailyRow, type StructRow } from "@/lib/adminStats";

// Memoria del negocio (solo admin): totales por MES cerrado (FTDs, comisión
// pagada a afiliados y tu beneficio), para comparar meses con el tiempo.
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

  const { data: structure } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, display_name, referred_by, subaffiliate_percent")
    .neq("user_id", user.id);
  const struct = (structure ?? []) as StructRow[];
  const structIds = struct.map((s) => s.user_id);
  const idsToLoad = [user.id, ...structIds];

  const { data: dailyRaw, error } = await supabaseAdmin
    .from("affiliate_daily_stats")
    .select("user_id, date, commission, clicks, registrations, ftd")
    .in("user_id", idsToLoad);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = (dailyRaw ?? []).map((d) => ({
    ...d,
    date: String(d.date).slice(0, 10),
  })) as DailyRow[];

  // Agrupamos por mes (YYYY-MM) y calculamos los totales de cada uno.
  const porMes = new Map<string, DailyRow[]>();
  for (const d of all) {
    const mes = d.date.slice(0, 7);
    const arr = porMes.get(mes) ?? [];
    arr.push(d);
    porMes.set(mes, arr);
  }

  const meses = [...porMes.entries()]
    .map(([mes, filas]) => {
      const { totals } = computeAdminStats(filas, user.id, me?.id, adminCpa, struct);
      return {
        mes,
        ftd: totals.ftd,
        // Lo pagado a afiliados incluye comisiones propias + overrides a padres.
        structurePaid: totals.structureOwed,
        totalClean: totals.totalClean,
        clicks: totals.clicks,
        registrations: totals.registrations,
      };
    })
    .sort((a, b) => (a.mes < b.mes ? 1 : -1)); // más reciente primero

  return NextResponse.json({ meses });
}
