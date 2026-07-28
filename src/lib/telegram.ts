// Utilidades para hablar con la API de Telegram (lado servidor).
// El token vive SOLO en la variable de entorno TELEGRAM_BOT_TOKEN (Vercel),
// nunca en el código. BLINDADO: cualquier fallo se traga (no rompe el flujo).

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID || "";

// Enlace de registro/depósito (afiliado). El "afp=bot" es el sub-id que vuelve
// en el postback de FreshBet, para saber qué depósitos vienen del bot.
export const ENLACE_JUGAR =
  "https://go.affision.com/visit/?bta=44878&nci=5520&afp=bot";

// Texto del botón de jugar (llamativo — Telegram no deja cambiar color/tamaño,
// solo el texto y los emojis).
const TEXTO_JUGAR = "🟢🎰 JUGAR AHORA 🎰🟢";

// Botones inline: jugar (abre el enlace) y "❓ AYUDA" (el bot invita a escribir
// su duda y la IA responde). Se añaden como reply_markup.
export function botonJugar() {
  return {
    inline_keyboard: [
      [{ text: TEXTO_JUGAR, url: ENLACE_JUGAR }],
      [{ text: "❓ AYUDA", callback_data: "ayuda" }],
    ],
  };
}

// Solo el botón del enlace (para las respuestas del chat, sin el de AYUDA).
export function botonSoloJugar() {
  return { inline_keyboard: [[{ text: TEXTO_JUGAR, url: ENLACE_JUGAR }]] };
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

// Llama a un método de la API del bot. Devuelve el JSON o null si falla.
export async function tgApi(
  method: string,
  params: Record<string, unknown>
): Promise<{ ok: boolean; result?: unknown; description?: string } | null> {
  if (!TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
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
  fileId: string
): Promise<{ base64: string; mediaType: string } | null> {
  if (!TOKEN || !fileId) return null;
  try {
    const info = await tgApi("getFile", { file_id: fileId });
    const filePath = (info?.result as { file_path?: string } | undefined)
      ?.file_path;
    if (!filePath) return null;
    const res = await fetch(
      `https://api.telegram.org/file/bot${TOKEN}/${filePath}`
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

// Envía un mensaje de texto a un chat. `reply_markup` opcional (botones).
export async function tgEnviar(
  chatId: number | string,
  text: string,
  extra?: Record<string, unknown>
) {
  return tgApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}
