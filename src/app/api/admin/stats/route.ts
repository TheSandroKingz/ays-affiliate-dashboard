import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { computeAdminStats, type DailyRow, type StructRow } from "@/lib/adminStats";

// Panel de admin = lo que TE LLEVAS LIMPIO. Ver src/lib/adminStats.ts para el
// cálculo. Filtro de fechas opcional (?from=YYYY-MM-DD&to=YYYY-MM-DD).
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

  const url = new URL(request.url);
  const fechaOk = (s: string | null) =>
    s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  const from = fechaOk(url.searchParams.get("from"));
  const to = fechaOk(url.searchParams.get("to"));
  let q = supabaseAdmin
    .from("affiliate_daily_stats")
    .select("user_id, date, commission, clicks, registrations, ftd")
    .in("user_id", idsToLoad);
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data: dailyRaw, error: dErr } = await q;
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const { stats, totals, own, daily } = computeAdminStats(
    (dailyRaw ?? []) as DailyRow[],
    user.id,
    me?.id,
    adminCpa,
    (structure ?? []) as StructRow[]
  );

  return NextResponse.json({ adminCpa, stats, totals, own, daily });
}
