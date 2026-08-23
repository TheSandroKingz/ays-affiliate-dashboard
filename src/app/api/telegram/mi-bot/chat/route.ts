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

  // Resiliente a que la columna full_file_id aún no exista (migración sin aplicar):
  // si el select falla por eso, reintenta sin ella (los vídeos no serán reproducibles
  // hasta aplicar el SQL, pero el chat se ve igual).
  const traer = (cols: string) =>
    supabaseAdmin
      .from("bot_messages")
      .select(cols)
      .eq("bot", bot.key)
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(500);
  const r1 = await traer("id, role, content, created_at, file_id, full_file_id, media_type");
  const r2 = r1.error
    ? await traer("id, role, content, created_at, file_id, media_type")
    : r1;
  type Fila = {
    id: number; role: string; content: string; created_at: string;
    file_id: string | null; full_file_id?: string | null; media_type: string | null;
  };
  const filas = (r2.data ?? []) as unknown as Fila[];

  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const history = filas.map((m) => {
    // Vídeo/animación con archivo real → se REPRODUCE en el visor. Foto (o vídeo
    // antiguo del que solo hay miniatura) → imagen. Sin nada servible → solo texto.
    const esVideo = (m.media_type === "video" || m.media_type === "animation") && !!m.full_file_id;
    const esImagen = !esVideo && !!m.file_id && m.media_type === "photo";
    const hayMedia = esVideo || esImagen;
    return {
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      media_type: m.media_type ?? null,
      media_kind: esVideo ? "video" : esImagen ? "image" : null,
      media_url:
        hayMedia && mediaKeyConfigurada()
          ? `/api/telegram/mi-bot/media?id=${m.id}&exp=${exp}&sig=${firmarMediaBot(
              m.id as number,
              exp
            )}`
          : null,
    };
  });
  return NextResponse.json({ history });
}
