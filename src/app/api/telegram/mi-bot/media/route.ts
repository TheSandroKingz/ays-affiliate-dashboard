import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { descargarFoto, firmarMediaBot, mediaKeyConfigurada } from "@/lib/telegram";
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

  const { data: msg } = await supabaseAdmin
    .from("bot_messages")
    .select("file_id, bot")
    .eq("id", id)
    .maybeSingle();
  const fileId = msg?.file_id as string | undefined;
  const bot = getBot(msg?.bot as string | undefined);
  if (!fileId || !bot || !bot.token) {
    return NextResponse.json({ error: "no existe" }, { status: 404 });
  }

  const img = await descargarFoto(fileId, bot.token);
  if (!img) return NextResponse.json({ error: "no disponible" }, { status: 502 });

  const bytes = Buffer.from(img.base64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": img.mediaType,
      // Evita MIME sniffing de los bytes que sube el jugador.
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
    },
  });
}
