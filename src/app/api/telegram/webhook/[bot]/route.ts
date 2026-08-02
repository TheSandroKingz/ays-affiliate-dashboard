import { NextResponse } from "next/server";
import { compararSecreto } from "@/lib/secreto";
import { getBot } from "@/lib/bots";
import { procesarUpdate } from "@/lib/botHandler";

// Webhook de los BOTS NUEVOS (Jeffer, Mariam, …). La URL lleva la clave del bot:
//   /api/telegram/webhook/jeffer   /api/telegram/webhook/mariam
// Cada bot registra su webhook con SU secreto (secret_token); si no coincide,
// ignoramos (200 silencioso) para que nadie falsee updates. El bot de Sandro NO
// pasa por aquí: sigue en /api/telegram/webhook.
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bot: string }> }
) {
  const { bot: key } = await params;
  const bot = getBot(key);
  // Bot desconocido o sin token/secreto configurado → 200 silencioso.
  if (!bot || !bot.token || !bot.secret) {
    return NextResponse.json({ ok: true });
  }

  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!compararSecreto(secret, bot.secret)) {
    return NextResponse.json({ ok: true });
  }

  const update = await request.json().catch(() => null);
  if (update) await procesarUpdate(bot, update);
  return NextResponse.json({ ok: true });
}
