import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Detalle de UN afiliado (solo admin): su perfil (CPA, billeteras, código) y su
// actividad diaria (clics, registros, FTD, comisión). Se usa al clicar su
// nombre en Estadísticas. Filtro de fechas opcional (?from=&to=).
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }

  const fechaOk = (s: string | null) =>
    s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  const from = fechaOk(url.searchParams.get("from"));
  const to = fechaOk(url.searchParams.get("to"));

  const { data: perfil, error: pErr } = await supabaseAdmin
    .from("affiliates")
    .select(
      "display_name, cpa_spain, cpa_other, subaffiliate_percent, wallet_erc20, wallet_trc20, freshaffs_tracking_code, created_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!perfil) {
    return NextResponse.json({ error: "Afiliado no encontrado" }, { status: 404 });
  }

  let q = supabaseAdmin
    .from("affiliate_daily_stats")
    .select("date, clicks, registrations, ftd, commission")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);

  const { data: daily, error: dErr } = await q;
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  return NextResponse.json({ perfil, daily: daily ?? [] });
}
