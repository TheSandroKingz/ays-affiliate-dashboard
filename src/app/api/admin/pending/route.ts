import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Lista de cuentas pendientes de aprobación.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select("user_id, display_name, created_at")
    .eq("approved", false)
    .order("created_at", { ascending: false });

  if (error) {
    // Si la columna aún no existe, devolvemos lista vacía (no rompe el panel).
    return NextResponse.json({ pending: [] });
  }
  return NextResponse.json({ pending: data ?? [] });
}

// Aprobar o rechazar una cuenta.
export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { userId, action } = await request.json();
  if (!userId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  if (action === "approve") {
    const { error } = await supabaseAdmin
      .from("affiliates")
      .update({ approved: true })
      .eq("user_id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Rechazar = eliminar la cuenta por completo.
  await supabaseAdmin.from("affiliate_daily_stats").delete().eq("user_id", userId);
  await supabaseAdmin.from("payments").delete().eq("user_id", userId);
  await supabaseAdmin.from("affiliates").delete().eq("user_id", userId);
  await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});

  return NextResponse.json({ ok: true });
}
