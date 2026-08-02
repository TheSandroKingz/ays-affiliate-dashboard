import { NextResponse } from "next/server";
import { compararSecreto } from "@/lib/secreto";
import { getBot } from "@/lib/bots";
import { procesarUpdate } from "@/lib/botHandler";

// Webhook de los BOTS NUEVOS (Jeffer, Mariam, …). La URL lleva la clave del bot:
//   /api/telegram/webhook/jeffer   /api/telegram/webhook/mariam
// El bot de Sandro NO pasa por aquí: sigue en /api/telegram/webhook.
//
// SEGURIDAD (secreto opcional): si el bot tiene configurado un secreto
// (TELEGRAM_WEBHOOK_SECRET_*), exigimos que el update traiga ese secret_token
// (bloquea updates falsos). Si NO hay secreto configurado, aceptamos igualmente
// para que el bot funcione sin ese paso extra (se puede añadir el secreto luego).
export const maxDuration = 60;

// Diagnóstico: dice si el bot tiene token/secreto/enlace/owner configurados en
// el entorno de Vercel (solo sí/no, NUNCA los valores). Sirve para depurar el
// alta de un bot sin exponer nada sensible.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bot: string }> }
) {
  const { bot: key } = await params;
  const bot = getBot(key);
  if (!bot) return NextResponse.json({ known: false });
  return NextResponse.json({
    known: true,
    bot: bot.key,
    tokenSet: !!bot.token,
    secretSet: !!bot.secret,
    enlaceSet: !!bot.enlace,
    ownerSet: !!bot.owner,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bot: string }> }
) {
  const { bot: key } = await params;
  const bot = getBot(key);
  // Bot desconocido o sin token → 200 silencioso (no hay nada que procesar).
  if (!bot || !bot.token) {
    return NextResponse.json({ ok: true });
  }

  // Si hay secreto configurado, debe coincidir; si no lo hay, no lo exigimos.
  if (bot.secret) {
    const secret = request.headers.get("x-telegram-bot-api-secret-token");
    if (!compararSecreto(secret, bot.secret)) {
      return NextResponse.json({ ok: true });
    }
  }

  const update = await request.json().catch(() => null);
  if (update) await procesarUpdate(bot, update);
  return NextResponse.json({ ok: true });
}
