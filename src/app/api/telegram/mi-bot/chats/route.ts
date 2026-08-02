import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { botPorTracking } from "@/lib/bots";

// Lista de conversaciones del BOT del afiliado (Jeffer, Mariam). Cada afiliado ve
// SOLO los chats de su bot (se filtra por bot.key). Sin datos de otros bots.
export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("freshaffs_tracking_code")
    .eq("user_id", user.id)
    .maybeSingle();
  const bot = botPorTracking(aff?.freshaffs_tracking_code);
  if (!bot) return NextResponse.json({ tieneBot: false, jugadores: [] });

  const { data } = await supabaseAdmin
    .from("bot_contacts")
    .select("chat_id, first_name, username, last_msg_at, opted_out")
    .eq("bot", bot.key)
    .order("last_msg_at", { ascending: false, nullsFirst: false })
    .limit(100);
  return NextResponse.json({ tieneBot: true, jugadores: data ?? [] });
}
