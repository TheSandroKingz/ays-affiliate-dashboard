import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";

export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const newEmail = body.newEmail;

  // Validación de formato de email en el servidor.
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(newEmail))) {
    return NextResponse.json({ error: "Correo no válido" }, { status: 400 });
  }

  // Siempre sobre la PROPIA cuenta del token (ignoramos cualquier userId del body).
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    email: newEmail,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
