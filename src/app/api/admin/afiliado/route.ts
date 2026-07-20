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

  let q = supabaseAdmin
    .from("affiliate_daily_stats")
    .select("date, clicks, registrations, ftd, commission")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);

  // Las tres consultas solo dependen de userId: en paralelo (más rápido).
  // El correo vive en la capa de auth (auth.users), no en affiliates; lo trae
  // el service role. Es seguro: esta ruta está protegida solo para el admin.
  const [perfilRes, authRes, dailyRes] = await Promise.all([
    supabaseAdmin
      .from("affiliates")
      .select(
        "display_name, avatar_url, cpa_spain, cpa_other, subaffiliate_percent, wallet_erc20, wallet_trc20, freshaffs_tracking_code, created_at"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
    q,
  ]);

  if (perfilRes.error) {
    return NextResponse.json({ error: perfilRes.error.message }, { status: 500 });
  }
  if (!perfilRes.data) {
    return NextResponse.json({ error: "Afiliado no encontrado" }, { status: 404 });
  }
  if (dailyRes.error) {
    return NextResponse.json({ error: dailyRes.error.message }, { status: 500 });
  }

  const email = authRes.data?.user?.email ?? null;

  return NextResponse.json({
    perfil: { ...perfilRes.data, email },
    daily: dailyRes.data ?? [],
  });
}
