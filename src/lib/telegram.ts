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

// Enlace de registro/depósito del bot. USamos el enlace de tracking S2S de Blue
// (blue2affiliates.com/g/…), NO el directo de celsius.games: el directo no genera
// clickid y el postback podría no dispararse. El g/ redirige a Celsius añadiendo
// click_id (y el sub1 si lo lleva). Sin sub1 = tráfico del bot = va a tu cuenta
// por defecto (Mongolitos). Los afiliados usan el mismo g/ con su ?s1=<código>.
// Enlace DEDICADO del bot de Sandro (BOT AS, código YmIjpivpyx). Al ser propio
// del bot, su tráfico se separa del Instagram del socio en el panel (afp "bot").
export const ENLACE_JUGAR = "https://celsius.games/YmIjpivpyx";

// ⛔ PAUSA (FreshBet cortó el tráfico — ya no trabajamos con ellos). Mientras
// esto sea true, NO se envía NINGÚN enlace/botón en ningún mensaje (chat, diario,
// bienvenida, broadcast): las funciones de botón devuelven undefined. Los bots
// siguen encendidos y respondiendo, pero sin enlaces y diciendo que ahora no va.
// Cuando volvamos a tener casino, poner false (y repasar los prompts).
export const ENLACES_PAUSADOS = false;

// Texto del botón de jugar (llamativo — Telegram no deja cambiar color/tamaño,
// solo el texto y los emojis).
const TEXTO_JUGAR = "🟢🎰 GANAR AHORA 🎰🟢";

// Botones inline: jugar (abre el enlace) y "❓ AYUDA" (el bot invita a escribir
// su duda y la IA responde). Se añaden como reply_markup. El `enlace` se puede
// pasar (bots nuevos con su propio enlace); por defecto usa el de Sandro. Si el
// enlace está vacío (bot nuevo sin enlace configurado aún), devolvemos undefined:
// Telegram rechaza un botón con url vacía y tumbaría todo el mensaje, así que
// mejor sin botón (el bot igual saluda y responde) hasta que se ponga el enlace.
export function botonJugar(enlace: string = ENLACE_JUGAR) {
  if (ENLACES_PAUSADOS || !enlace) return undefined;
  return {
    inline_keyboard: [
      [{ text: TEXTO_JUGAR, url: enlace }],
      [{ text: "❓ AYUDA", callback_data: "ayuda" }],
    ],
  };
}

// Solo el botón del enlace (para las respuestas del chat, sin el de AYUDA).
export function botonSoloJugar(enlace: string = ENLACE_JUGAR) {
  if (ENLACES_PAUSADOS || !enlace) return undefined;
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

// Caché corta de fotos ya descargadas (las imágenes son inmutables). Evita
// re-descargar de Telegram la misma foto en visiones repetidas de la IA y en
// recargas del visor de media (menos latencia y menos egress facturable). Tope
// de pocas entradas para no comernos la memoria del serverless.
type FotoCache = { base64: string; mediaType: string };
const fotoCache = new Map<string, { value: FotoCache; exp: number }>();
const FOTO_TTL = 90 * 1000;
const FOTO_CACHE_MAX = 8;

// Descarga un archivo de Telegram (foto/documento) por su file_id y lo devuelve
// en base64 para pasárselo a la IA con visión. null si falla o es muy grande.
// BLINDADO: cualquier fallo devuelve null y el flujo sigue con solo texto.
export async function descargarFoto(
  fileId: string,
  token: string = TOKEN
): Promise<{ base64: string; mediaType: string } | null> {
  if (!token || !fileId) return null;
  const hit = fotoCache.get(fileId);
  if (hit && hit.exp > Date.now()) return hit.value;
  try {
    const info = await tgApi("getFile", { file_id: fileId }, token);
    const filePath = (info?.result as { file_path?: string } | undefined)
      ?.file_path;
    if (!filePath) return null;
    // Defensa en profundidad: file_path viene de Telegram (confiable), pero lo
    // validamos con un patrón conservador (sin "..", solo ruta simple) antes de
    // interpolarlo en la URL, por si un cambio futuro devolviera algo raro.
    if (!/^[\w./-]+$/.test(filePath) || filePath.includes("..")) return null;
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
    const value: FotoCache = { base64: buf.toString("base64"), mediaType };
    fotoCache.set(fileId, { value, exp: Date.now() + FOTO_TTL });
    if (fotoCache.size > FOTO_CACHE_MAX) {
      const primera = fotoCache.keys().next().value;
      if (primera !== undefined) fotoCache.delete(primera);
    }
    return value;
  } catch {
    return null;
  }
}

// Descarga un archivo COMPLETO de Telegram (vídeo/animación/foto/documento) por
// su file_id, para REPRODUCIRLO en el visor de chats del panel. A diferencia de
// descargarFoto (solo imagen, 4MB, base64 para la visión de la IA), aquí
// devolvemos los bytes crudos con su mime real y un tope mayor (Telegram deja
// descargar hasta ~20MB por la API del bot). BLINDADO: cualquier fallo → null.
//
// Caché corta en memoria por file_id: al hacer SEEK en un vídeo el navegador pide
// varios tramos (Range) seguidos; sin caché re-descargaríamos el archivo entero
// de Telegram en cada tramo. Con ella, el primero lo baja y los demás salen al
// instante. Tope de pocas entradas para no comernos la memoria del serverless.
type MediaCacheEntry = { bytes: Buffer; mediaType: string };
const mediaCache = new Map<string, { value: MediaCacheEntry; exp: number }>();
const MEDIA_TTL = 90 * 1000; // 90s
const MEDIA_CACHE_MAX = 3;

export async function descargarMedia(
  fileId: string,
  token: string = TOKEN
): Promise<MediaCacheEntry | null> {
  if (!token || !fileId) return null;
  const now = Date.now();
  const hit = mediaCache.get(fileId);
  if (hit && hit.exp > now) return hit.value;
  try {
    const info = await tgApi("getFile", { file_id: fileId }, token);
    const filePath = (info?.result as { file_path?: string } | undefined)
      ?.file_path;
    if (!filePath) return null;
    if (!/^[\w./-]+$/.test(filePath) || filePath.includes("..")) return null;
    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`
    );
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    // Tope de seguridad ~20MB (límite práctico de descarga por bot en Telegram).
    if (bytes.length > 20_000_000) return null;
    const ext = filePath.split(".").pop()?.toLowerCase();
    const mediaType =
      ext === "mp4"
        ? "video/mp4"
        : ext === "mov"
        ? "video/quicktime"
        : ext === "webm"
        ? "video/webm"
        : ext === "png"
        ? "image/png"
        : ext === "webp"
        ? "image/webp"
        : ext === "gif"
        ? "image/gif"
        : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : "application/octet-stream";
    const value: MediaCacheEntry = { bytes, mediaType };
    // Guarda en caché y poda las entradas más viejas si nos pasamos del tope.
    mediaCache.set(fileId, { value, exp: now + MEDIA_TTL });
    if (mediaCache.size > MEDIA_CACHE_MAX) {
      const primera = mediaCache.keys().next().value;
      if (primera !== undefined) mediaCache.delete(primera);
    }
    return value;
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
