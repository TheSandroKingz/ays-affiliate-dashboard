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
    .in("user_id", idsToLoad)
    .limit(100000); // sin límite, PostgREST corta en 1000 y el histórico saldría corto
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

  // Gastos (publicidad, infra…) sumados por mes, para ver la inversión mensual.
  const { data: gastosRaw } = await supabaseAdmin
    .from("gastos")
    .select("fecha, importe")
    .limit(100000);
  const gastosPorMes = new Map<string, number>();
  for (const g of (gastosRaw ?? []) as { fecha: string; importe: number }[]) {
    const mes = String(g.fecha).slice(0, 7);
    gastosPorMes.set(mes, (gastosPorMes.get(mes) ?? 0) + Number(g.importe ?? 0));
  }

  // Penalizaciones (dinero que el casino nos resta a fin de mes). Dato manual por
  // mes. Blindado: si la tabla aún no existe, tratamos todo como 0 (no rompe).
  const penalPorMes = new Map<string, number>();
  try {
    const { data: penalRaw } = await supabaseAdmin
      .from("penalizaciones")
      .select("mes, importe")
      .limit(100000);
    for (const p of (penalRaw ?? []) as { mes: string; importe: number }[]) {
      penalPorMes.set(String(p.mes), Number(p.importe ?? 0));
    }
  } catch {
    /* tabla no creada todavía: penalización = 0 */
  }

  const meses = [...porMes.entries()]
    .map(([mes, filas]) => {
      const { totals } = computeAdminStats(filas, user.id, me?.id, adminCpa, struct);
      const penalizacion = penalPorMes.get(mes) ?? 0;
      return {
        mes,
        ftd: totals.ftd,
        // Lo pagado a afiliados incluye comisiones propias + overrides a padres.
        structurePaid: totals.structureOwed,
        // Beneficio ANTES de restar la penalización (por si se quiere ver crudo).
        totalClean: totals.totalClean,
        penalizacion,
        // Beneficio REAL: lo limpio menos lo que el casino nos restó ese mes.
        beneficio: totals.totalClean - penalizacion,
        clicks: totals.clicks,
        registrations: totals.registrations,
        gastos: gastosPorMes.get(mes) ?? 0,
      };
    })
    .sort((a, b) => (a.mes < b.mes ? 1 : -1)); // más reciente primero

  return NextResponse.json({ meses });
}

// Fijar/editar la PENALIZACIÓN (dinero restado por el casino) de un mes. Solo
// admin. body: { mes: "YYYY-MM", importe: number }. importe 0 borra el apunte.
export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { mes, importe } = await request.json().catch(() => ({}));
  if (typeof mes !== "string" || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: "Mes inválido (YYYY-MM)." }, { status: 400 });
  }
  const imp = Number(importe);
  // Tope de seguridad ante un typo; la penalización es un número positivo (€ que
  // te restan). 0 = sin penalización (borramos el apunte).
  if (!Number.isFinite(imp) || imp < 0 || imp > 1_000_000) {
    return NextResponse.json({ error: "Importe inválido." }, { status: 400 });
  }

  if (imp === 0) {
    const { error } = await supabaseAdmin.from("penalizaciones").delete().eq("mes", mes);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, mes, importe: 0 });
  }

  const { error } = await supabaseAdmin
    .from("penalizaciones")
    .upsert({ mes, importe: imp, updated_at: new Date().toISOString() }, { onConflict: "mes" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mes, importe: imp });
}
