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
  const esBotNuevo = origenRaw === "jeffer" || origenRaw === "mariam" || origenRaw === "blackkp";
  if (!chatId) return NextResponse.json({ error: "Falta chat_id." }, { status: 400 });

  // Traemos los 500 mensajes MÁS RECIENTES (order desc + limit) y los invertimos
  // a orden cronológico. Con ascending+limit salían los 500 más VIEJOS y en un
  // chat largo nunca se veían los mensajes recientes.
  // Resiliente a que full_file_id aún no exista (migración sin aplicar): si el
  // select falla por eso, reintenta sin ella (vídeos no reproducibles hasta el SQL).
  const traer = (cols: string) => {
    const q = esBotNuevo
      ? supabaseAdmin.from("bot_messages").select(cols).eq("bot", origenRaw).eq("chat_id", chatId)
      : supabaseAdmin.from("telegram_messages").select(cols).eq("chat_id", chatId);
    return q.order("created_at", { ascending: false }).limit(500);
  };
  const r1 = await traer("id, role, content, created_at, file_id, full_file_id, media_type");
  const r2 = r1.error
    ? await traer("id, role, content, created_at, file_id, media_type")
    : r1;
  type Fila = {
    id: number; role: string; content: string; created_at: string;
    file_id: string | null; full_file_id?: string | null; media_type: string | null;
  };
  const filas = ((r2.data ?? []) as unknown as Fila[]).slice().reverse();

  // Caducidad de 12h para las URLs de imagen (suficiente para ver el chat). Cada
  // bot firma y sirve su media por su propia ruta (Sandro /media, bots nuevos /mi-bot/media).
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const history = filas.map((m) => {
    const id = m.id as number;
    const esVid = m.media_type === "video" || m.media_type === "animation";
    // ¿Reproducible como VÍDEO? En el bot de Sandro el file_id ya es el vídeo real;
    // en los bots nuevos hace falta el full_file_id (el file_id es solo miniatura).
    const playable = esBotNuevo ? esVid && !!m.full_file_id : esVid;
    // ¿Servible como IMAGEN? Fotos siempre; y en bots nuevos, un vídeo del que solo
    // hay miniatura (antiguos) se muestra como fotograma.
    const comoImagen =
      !playable && !!m.file_id && (m.media_type === "photo" || (esBotNuevo && esVid));
    let media_url: string | null = null;
    let media_kind: "video" | "image" | null = null;
    if ((playable || comoImagen) && mediaKeyConfigurada()) {
      media_kind = playable ? "video" : "image";
      media_url = esBotNuevo
        ? `/api/telegram/mi-bot/media?id=${id}&exp=${exp}&sig=${firmarMediaBot(id, exp)}`
        : `/api/telegram/media?id=${id}&exp=${exp}&sig=${firmarMedia(id, exp)}`;
    }
    return {
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      media_type: m.media_type ?? null,
      media_kind,
      media_url,
    };
  });
  return NextResponse.json({ history });
}
