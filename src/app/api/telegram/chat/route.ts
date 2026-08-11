import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getGestorBot } from "@/lib/adminAuth";
import { firmarMedia, mediaKeyConfigurada } from "@/lib/telegram";

// Devuelve la conversación guardada de un jugador (para verla en el panel), con
// una URL firmada temporal para las imágenes. La leen el admin y los gestores
// del bot (Yaiza).
export async function GET(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const chatId = Number(new URL(request.url).searchParams.get("chat_id"));
  if (!chatId) return NextResponse.json({ error: "Falta chat_id." }, { status: 400 });
  const { data } = await supabaseAdmin
    .from("telegram_messages")
    .select("id, role, content, created_at, file_id, media_type")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(500);

  // Caducidad de 12h para las URLs de imagen (suficiente para ver el chat).
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const history = (data ?? []).map((m) => {
    const esImagen =
      m.file_id && (m.media_type === "photo" || m.media_type === "animation");
    return {
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      media_type: m.media_type ?? null,
      media_url:
        esImagen && mediaKeyConfigurada()
          ? `/api/telegram/media?id=${m.id}&exp=${exp}&sig=${firmarMedia(
              m.id as number,
              exp
            )}`
          : null,
    };
  });
  return NextResponse.json({ history });
}
