import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getGestorBot } from "@/lib/adminAuth";
import { firmarMedia, firmarMediaBot, mediaKeyConfigurada } from "@/lib/telegram";

// Devuelve la conversación guardada de un jugador (para verla en el panel), con
// una URL firmada temporal para las imágenes. La leen el admin y los gestores
// del bot (Yaiza). `origen`: "as" = bot de Sandro (telegram_messages); "jeffer"
// = bot de Jeffer (bot_messages). Así el panel de Yaiza ve ambos.
export async function GET(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = new URL(request.url);
  const chatId = Number(url.searchParams.get("chat_id"));
  // "as" = bot de Sandro (telegram_messages). Los demás son bots nuevos
  // (bot_messages): "jeffer" y "mariam" (persona Livana).
  const origenRaw = url.searchParams.get("origen") || "as";
  const esBotNuevo = origenRaw === "jeffer" || origenRaw === "mariam";
  if (!chatId) return NextResponse.json({ error: "Falta chat_id." }, { status: 400 });

  const query = esBotNuevo
    ? supabaseAdmin
        .from("bot_messages")
        .select("id, role, content, created_at, file_id, media_type")
        .eq("bot", origenRaw)
        .eq("chat_id", chatId)
    : supabaseAdmin
        .from("telegram_messages")
        .select("id, role, content, created_at, file_id, media_type")
        .eq("chat_id", chatId);
  const { data } = await query.order("created_at", { ascending: true }).limit(500);

  // Caducidad de 12h para las URLs de imagen (suficiente para ver el chat). Cada
  // bot firma y sirve su media por su propia ruta (Sandro /media, bots nuevos /mi-bot/media).
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const history = (data ?? []).map((m) => {
    const esImagen =
      m.file_id && (m.media_type === "photo" || m.media_type === "animation");
    const id = m.id as number;
    let media_url: string | null = null;
    if (esImagen && mediaKeyConfigurada()) {
      media_url = esBotNuevo
        ? `/api/telegram/mi-bot/media?id=${id}&exp=${exp}&sig=${firmarMediaBot(id, exp)}`
        : `/api/telegram/media?id=${id}&exp=${exp}&sig=${firmarMedia(id, exp)}`;
    }
    return {
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      media_type: m.media_type ?? null,
      media_url,
    };
  });
  return NextResponse.json({ history });
}
