// Avisos por Telegram. BLINDADO: si no hay credenciales configuradas o la
// llamada falla, no hace nada y no lanza error (nunca rompe el flujo que lo
// llama). Configura en las variables de entorno (Vercel):
//   TELEGRAM_BOT_TOKEN  -> el token que te da @BotFather
//   TELEGRAM_CHAT_ID    -> tu chat id (te lo da @userinfobot)
export async function notificarTelegram(mensaje: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: mensaje,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch {
    // Un aviso que falla nunca debe afectar al registro/FTD.
  }
}
