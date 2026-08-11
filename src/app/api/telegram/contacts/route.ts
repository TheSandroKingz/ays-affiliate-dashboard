import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser, getGestorBot } from "@/lib/adminAuth";

// GET: lista de jugadores (para el panel). Lo pueden LEER el admin y los gestores
// del bot (Yaiza). POST: silenciar/reactivar a uno — solo admin.
export async function GET(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data } = await supabaseAdmin
    .from("telegram_contacts")
    .select("chat_id, first_name, username, last_msg_at, opted_out, silenced")
    .order("last_msg_at", { ascending: false, nullsFirst: false })
    .limit(150);
  return NextResponse.json({ jugadores: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const chatId = Number(body?.chat_id);
  const silenced = !!body?.silenced;
  if (!chatId) {
    return NextResponse.json({ error: "Falta chat_id." }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("telegram_contacts")
    .update({ silenced })
    .eq("chat_id", chatId);
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}
