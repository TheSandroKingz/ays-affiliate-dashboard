import { NextResponse } from "next/server";
import { compararSecreto } from "@/lib/secreto";
import { getAdminUser } from "@/lib/adminAuth";
import { getBot } from "@/lib/bots";
import { procesarUpdate } from "@/lib/botHandler";

// Webhook de los BOTS NUEVOS (Jeffer, Mariam, …). La URL lleva la clave del bot:
//   /api/telegram/webhook/jeffer   /api/telegram/webhook/mariam
// El bot de Sandro NO pasa por aquí: sigue en /api/telegram/webhook.
//
// SEGURIDAD: el secreto del webhook es OBLIGATORIO. El update debe traer el
// secret_token que Telegram manda (cabecera) y coincidir. Un bot sin secreto
// configurado NO se procesa (mejor no responder que aceptar updates falsos que
// podrían quemar saldo de IA, inyectar mensajes o, con el owner, difundir spam).
export const maxDuration = 60;

// Diagnóstico (SOLO ADMIN): dice si el bot tiene token/secreto/enlace/owner
// configurados (solo sí/no, nunca los valores). Con auth para no revelar qué
// bots existen ni cuáles están mal configurados.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ bot: string }> }
) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
  // Bot desconocido, sin token o SIN SECRETO → 200 silencioso, no procesamos.
  // Exigir secreto siempre: sin él, cualquiera podría forjar updates.
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
