import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser, ADMIN_USER_ID } from "@/lib/adminAuth";
import { depositoMedio } from "@/lib/postback";

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
        "display_name, avatar_url, cpa_spain, cpa_other, subaffiliate_percent, wallet_erc20, wallet_trc20, freshaffs_tracking_code, created_at, active"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
    q,
  ]);

  let perfil = perfilRes.data as Record<string, unknown> | null;
  let perfilErr = perfilRes.error;
  // Por si la columna 'active' aún no existe: reintentamos sin ella.
  if (perfilErr) {
    const r = await supabaseAdmin
      .from("affiliates")
      .select(
        "display_name, avatar_url, cpa_spain, cpa_other, subaffiliate_percent, wallet_erc20, wallet_trc20, freshaffs_tracking_code, created_at"
      )
      .eq("user_id", userId)
      .maybeSingle();
    perfil = r.data as Record<string, unknown> | null;
    perfilErr = r.error;
  }

  if (perfilErr) {
    return NextResponse.json({ error: perfilErr.message }, { status: 500 });
  }
  if (!perfil) {
    return NextResponse.json({ error: "Afiliado no encontrado" }, { status: 404 });
  }
  if (dailyRes.error) {
    return NextResponse.json({ error: dailyRes.error.message }, { status: 500 });
  }

  const email = authRes.data?.user?.email ?? null;
  const deposito = await depositoMedio(userId);

  return NextResponse.json({
    perfil: { active: true, ...perfil, email },
    daily: dailyRes.data ?? [],
    deposito, // { media, num }
  });
}

// Gestión de un afiliado (solo admin): editar el nombre y activar/desactivar
// (bloquear el acceso sin borrar la cuenta).
export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { userId, display_name, active } = body;
  if (!userId) {
    return NextResponse.json({ error: "Falta userId" }, { status: 400 });
  }
  if (userId === ADMIN_USER_ID) {
    return NextResponse.json(
      { error: "No se puede modificar la cuenta de administrador." },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {};
  if (typeof display_name === "string") {
    const n = display_name.trim();
    if (n.length < 2 || n.length > 40) {
      return NextResponse.json(
        { error: "El nombre debe tener entre 2 y 40 caracteres." },
        { status: 400 }
      );
    }
    update.display_name = n;
  }
  if (typeof active === "boolean") {
    update.active = active;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update(update)
    .eq("user_id", userId);
  if (error) {
    const message =
      error.code === "23505"
        ? "Ese nombre ya está en uso, elige otro."
        : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
