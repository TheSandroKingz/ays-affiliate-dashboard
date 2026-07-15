import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !authData.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { userId, newEmail } = await request.json();

  if (!userId || !newEmail) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  if (authData.user.id !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
