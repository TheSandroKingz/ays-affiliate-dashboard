import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { descargarFoto, descargarMedia, firmarMedia, mediaKeyConfigurada } from "@/lib/telegram";
import { respuestaMedia } from "@/lib/mediaResponse";

// Sirve una imagen que un jugador envió por Telegram, para verla en el visor de
// chats del panel. NO usa sesión (un <img> no manda cabeceras): se protege con
// una URL FIRMADA temporal que genera /api/telegram/chat (solo admin). Así solo
// quien ya vio el chat (admin) tiene URLs válidas, y caducan a las 12h.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") || "";

  if (!id || !exp || !sig) {
    return NextResponse.json({ error: "faltan datos" }, { status: 400 });
  }
  // Sin clave de firma, el HMAC iría bajo clave vacía (conocida) y cualquiera
  // podría falsificar una firma válida y sacar fotos privadas. Rechazamos.
  if (!mediaKeyConfigurada()) {
    return NextResponse.json({ error: "no disponible" }, { status: 503 });
  }
  // Caducada.
  if (Math.floor(Date.now() / 1000) > exp) {
    return NextResponse.json({ error: "caducada" }, { status: 403 });
  }
  // Firma correcta (comparación en tiempo constante).
  const esperada = firmarMedia(id, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "firma inválida" }, { status: 403 });
  }

  // Resiliente a que full_file_id aún no exista (migración sin aplicar).
  const first = await supabaseAdmin
    .from("telegram_messages")
    .select("file_id, full_file_id, media_type")
    .eq("id", id)
    .maybeSingle();
  let msg = first.data as { file_id?: string; full_file_id?: string; media_type?: string } | null;
  if (first.error) {
    const second = await supabaseAdmin
      .from("telegram_messages")
      .select("file_id, media_type")
      .eq("id", id)
      .maybeSingle();
    msg = second.data as typeof msg;
  }
  const fileId = msg?.file_id as string | undefined;
  const fullId = msg?.full_file_id as string | undefined;
  const tipo = msg?.media_type as string | undefined;
  if (!fileId && !fullId) return NextResponse.json({ error: "no existe" }, { status: 404 });

  // Vídeo/animación → reproducible (mime de vídeo, tope 20MB); si no, imagen.
  const esVideo = tipo === "video" || tipo === "animation";
  let bytes: Buffer | null = null;
  let mime = "application/octet-stream";
  if (esVideo) {
    const media = await descargarMedia((fullId ?? fileId)!);
    if (media) {
      bytes = media.bytes;
      mime = media.mediaType;
    }
  } else {
    const img = await descargarFoto(fileId!);
    if (img) {
      bytes = Buffer.from(img.base64, "base64");
      mime = img.mediaType;
    }
  }
  if (!bytes) return NextResponse.json({ error: "no disponible" }, { status: 502 });

  // Con soporte de Range (206) para poder avanzar/rebobinar el vídeo.
  return respuestaMedia(bytes, mime, request.headers.get("range"));
}
