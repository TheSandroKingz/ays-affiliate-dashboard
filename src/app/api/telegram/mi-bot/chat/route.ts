import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { botPorTracking } from "@/lib/bots";
import { firmarMediaBot, mediaKeyConfigurada } from "@/lib/telegram";

// Conversación guardada de un jugador con el BOT del afiliado. Filtrada por el
// bot del afiliado (no puede ver chats de otro bot). Las fotos se sirven con una
// URL FIRMADA temporal (namespace de bot) que valida /api/telegram/mi-bot/media.
export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("freshaffs_tracking_code")
    .eq("user_id", user.id)
    .maybeSingle();
  const bot = botPorTracking(aff?.freshaffs_tracking_code);
  if (!bot) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const chatId = Number(new URL(request.url).searchParams.get("chat_id"));
  if (!chatId) return NextResponse.json({ error: "Falta chat_id." }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("bot_messages")
    .select("id, role, content, created_at, file_id, media_type")
    .eq("bot", bot.key)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(500);

  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const history = (data ?? []).map((m) => {
    // Solo mostramos como imagen las FOTOS (los vídeos se guardan como vídeo y no
    // se pueden servir como imagen). El texto ("[vídeo]") ya da el contexto.
    const esImagen = m.file_id && m.media_type === "photo";
    return {
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      media_type: m.media_type ?? null,
      media_url:
        esImagen && mediaKeyConfigurada()
          ? `/api/telegram/mi-bot/media?id=${m.id}&exp=${exp}&sig=${firmarMediaBot(
              m.id as number,
              exp
            )}`
          : null,
    };
  });
  return NextResponse.json({ history });
}
