// Utilidades para hablar con la API de Telegram (lado servidor).
// El token vive SOLO en la variable de entorno TELEGRAM_BOT_TOKEN (Vercel),
// nunca en el código. BLINDADO: cualquier fallo se traga (no rompe el flujo).

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID || "";

// Enlace de registro/depósito (afiliado). Fuente única: cámbialo aquí si cambia.
export const ENLACE_JUGAR =
  "https://go.affision.com/visit/?bta=44878&nci=5520";

// Texto del botón de jugar (llamativo — Telegram no deja cambiar color/tamaño,
// solo el texto y los emojis).
const TEXTO_JUGAR = "🔥🎰 JUGAR AHORA 🎰🔥";

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
