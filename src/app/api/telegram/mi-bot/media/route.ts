import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { descargarFoto, descargarMedia, firmarMediaBot, mediaKeyConfigurada } from "@/lib/telegram";
import { respuestaMedia } from "@/lib/mediaResponse";
import { getBot } from "@/lib/bots";

// Sirve una imagen que un jugador envió a un BOT (Jeffer/Mariam), para verla en
// el visor de chats del afiliado. Sin sesión (un <img> no manda cabeceras): se
// protege con la URL FIRMADA temporal que genera /api/telegram/mi-bot/chat (que
// sí exige sesión y solo firma imágenes del bot de ESE afiliado). La imagen se
// descarga con el token del bot al que pertenece el mensaje.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") || "";

  if (!id || !exp || !sig) {
    return NextResponse.json({ error: "faltan datos" }, { status: 400 });
  }
  if (!mediaKeyConfigurada()) {
    return NextResponse.json({ error: "no disponible" }, { status: 503 });
  }
  if (Math.floor(Date.now() / 1000) > exp) {
    return NextResponse.json({ error: "caducada" }, { status: 403 });
  }
  const esperada = firmarMediaBot(id, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "firma inválida" }, { status: 403 });
  }

  // Resiliente a que full_file_id aún no exista (migración sin aplicar).
  const first = await supabaseAdmin
    .from("bot_messages")
    .select("file_id, full_file_id, media_type, bot")
    .eq("id", id)
    .maybeSingle();
  let msg = first.data as { file_id?: string; full_file_id?: string; media_type?: string; bot?: string } | null;
  if (first.error) {
    const second = await supabaseAdmin
      .from("bot_messages")
      .select("file_id, media_type, bot")
      .eq("id", id)
      .maybeSingle();
    msg = second.data as typeof msg;
  }
  const fileId = msg?.file_id as string | undefined;
  const fullId = msg?.full_file_id as string | undefined;
  const tipo = msg?.media_type as string | undefined;
  const bot = getBot(msg?.bot as string | undefined);
  if ((!fileId && !fullId) || !bot || !bot.token) {
    return NextResponse.json({ error: "no existe" }, { status: 404 });
  }

  // Vídeo/animación con archivo real guardado → lo servimos REPRODUCIBLE (mime de
  // vídeo, tope 20MB). Si no, servimos la imagen/miniatura como hasta ahora.
  const esVideo = (tipo === "video" || tipo === "animation") && !!fullId;
  let bytes: Buffer | null = null;
  let mime = "application/octet-stream";
  if (esVideo) {
    const media = await descargarMedia(fullId!, bot.token);
    if (media) {
      bytes = media.bytes;
      mime = media.mediaType;
    }
  } else {
    const img = await descargarFoto(fileId!, bot.token);
    if (img) {
      bytes = Buffer.from(img.base64, "base64");
      mime = img.mediaType;
    }
  }
  if (!bytes) return NextResponse.json({ error: "no disponible" }, { status: 502 });

  // Con soporte de Range (206) para poder avanzar/rebobinar el vídeo.
  return respuestaMedia(bytes, mime, request.headers.get("range"));
}
