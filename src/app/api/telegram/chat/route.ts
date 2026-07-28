import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Devuelve la conversación guardada de un jugador (para verla en el panel).
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const chatId = Number(new URL(request.url).searchParams.get("chat_id"));
  if (!chatId) return NextResponse.json({ error: "Falta chat_id." }, { status: 400 });
  const { data } = await supabaseAdmin
    .from("telegram_messages")
    .select("role, content, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(500);
  return NextResponse.json({ history: data ?? [] });
}
