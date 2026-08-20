import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { descargarFoto, firmarMedia, mediaKeyConfigurada } from "@/lib/telegram";

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

  const { data: msg } = await supabaseAdmin
    .from("telegram_messages")
    .select("file_id")
    .eq("id", id)
    .maybeSingle();
  const fileId = msg?.file_id as string | undefined;
  if (!fileId) return NextResponse.json({ error: "no existe" }, { status: 404 });

  const img = await descargarFoto(fileId);
  if (!img) return NextResponse.json({ error: "no disponible" }, { status: 502 });

  const bytes = Buffer.from(img.base64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": img.mediaType,
      // Evita que el navegador reinterprete (MIME sniffing) los bytes del jugador.
      "x-content-type-options": "nosniff",
      // Cache privada corta: el navegador la reusa mientras ves el chat.
      "cache-control": "private, max-age=3600",
    },
  });
}
