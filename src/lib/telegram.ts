// Utilidades para hablar con la API de Telegram (lado servidor).
// El token vive SOLO en la variable de entorno TELEGRAM_BOT_TOKEN (Vercel),
// nunca en el código. BLINDADO: cualquier fallo se traga (no rompe el flujo).

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Firma HMAC para las URLs temporales de imágenes del chat (el navegador pide la
// imagen en un <img> sin cabeceras; el servidor valida la firma). La clave vive
// solo en el servidor. La usan /api/telegram/chat (firma) y /media (verifica).
const MEDIA_KEY =
  process.env.TELEGRAM_WEBHOOK_SECRET || process.env.POSTBACK_SECRET || "";
export function firmarMedia(id: number, exp: number): string {
  return crypto
    .createHmac("sha256", MEDIA_KEY)
    .update(`${id}.${exp}`)
    .digest("hex");
}
export function mediaKeyConfigurada(): boolean {
  return !!MEDIA_KEY;
}
// Firma para las imágenes de los BOTS NUEVOS (tabla bot_messages). Usa un
// espacio de nombres distinto ("bot.") para que una URL firmada de un bot NO
// sirva contra el endpoint de imágenes del bot de Sandro (telegram_messages), ni
// al revés: el id por sí solo no basta, la firma incluye el prefijo.
export function firmarMediaBot(id: number, exp: number): string {
  return crypto
    .createHmac("sha256", MEDIA_KEY)
    .update(`bot.${id}.${exp}`)
    .digest("hex");
}
export const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID || "";

// Enlace de registro/depósito (afiliado). El "afp=bot" es el sub-id que vuelve
// en el postback de FreshBet, para saber qué depósitos vienen del bot.
export const ENLACE_JUGAR =
  "https://go.affision.com/visit/?bta=44878&nci=5520&afp=bot";

// Texto del botón de jugar (llamativo — Telegram no deja cambiar color/tamaño,
// solo el texto y los emojis).
const TEXTO_JUGAR = "🟢🎰 JUGAR AHORA 🎰🟢";

// Botones inline: jugar (abre el enlace) y "❓ AYUDA" (el bot invita a escribir
// su duda y la IA responde). Se añaden como reply_markup. El `enlace` se puede
// pasar (bots nuevos con su propio enlace); por defecto usa el de Sandro. Si el
// enlace está vacío (bot nuevo sin enlace configurado aún), devolvemos undefined:
// Telegram rechaza un botón con url vacía y tumbaría todo el mensaje, así que
// mejor sin botón (el bot igual saluda y responde) hasta que se ponga el enlace.
export function botonJugar(enlace: string = ENLACE_JUGAR) {
  if (!enlace) return undefined;
  return {
    inline_keyboard: [
      [{ text: TEXTO_JUGAR, url: enlace }],
      [{ text: "❓ AYUDA", callback_data: "ayuda" }],
    ],
  };
}

// Solo el botón del enlace (para las respuestas del chat, sin el de AYUDA).
export function botonSoloJugar(enlace: string = ENLACE_JUGAR) {
  if (!enlace) return undefined;
  return { inline_keyboard: [[{ text: TEXTO_JUGAR, url: enlace }]] };
}

// Guarda un message_id para borrarlo luego (limpieza automática de chats).
// NO se usa con la bienvenida (esa se deja intacta). BLINDADO.
export async function guardarMsg(
  chatId: number | string,
  messageId?: number | null
): Promise<void> {
  if (!messageId) return;
  await supabaseAdmin
    .from("telegram_sent")
    .insert({ chat_id: Number(chatId), message_id: messageId })
    .then(() => {}, () => {});
}

// Extrae el message_id de la respuesta de tgApi/tgEnviar (o null).
export function midDe(r: { ok?: boolean; result?: unknown } | null): number | null {
  return (r?.result as { message_id?: number } | undefined)?.message_id ?? null;
}

export function telegramConfigurado(): boolean {
  return !!TOKEN;
}

// Llama a un método de la API del bot. Devuelve el JSON o null si falla. El
// `token` se puede pasar (bots nuevos con su propio token); por defecto el de Sandro.
export async function tgApi(
  method: string,
  params: Record<string, unknown>,
  token: string = TOKEN
): Promise<{ ok: boolean; result?: unknown; description?: string } | null> {
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch {
    return null;
  }
}

// Descarga un archivo de Telegram (foto/documento) por su file_id y lo devuelve
// en base64 para pasárselo a la IA con visión. null si falla o es muy grande.
// BLINDADO: cualquier fallo devuelve null y el flujo sigue con solo texto.
export async function descargarFoto(
  fileId: string,
  token: string = TOKEN
): Promise<{ base64: string; mediaType: string } | null> {
  if (!token || !fileId) return null;
  try {
    const info = await tgApi("getFile", { file_id: fileId }, token);
    const filePath = (info?.result as { file_path?: string } | undefined)
      ?.file_path;
    if (!filePath) return null;
    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`
    );
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Tope de seguridad (~4MB) para no petar memoria ni la API de la IA.
    if (buf.length > 4_000_000) return null;
    const ext = filePath.split(".").pop()?.toLowerCase();
    const mediaType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : ext === "gif"
        ? "image/gif"
        : "image/jpeg";
    return { base64: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}

// Envía un mensaje de texto a un chat. `reply_markup` opcional (botones). El
// `token` se puede pasar (bots nuevos); por defecto usa el de Sandro.
export async function tgEnviar(
  chatId: number | string,
  text: string,
  extra?: Record<string, unknown>,
  token: string = TOKEN
) {
  return tgApi(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    },
    token
  );
}
