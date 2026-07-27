import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { tgApi, telegramConfigurado } from "@/lib/telegram";

// Reapunta el webhook de Telegram a ESTA web (la que estás usando ahora). Útil
// cuando Telegram se quedó enviando a un despliegue viejo sin la IA.
// GET: muestra a dónde está enviando ahora. POST: lo reapunta a este dominio.

export async function GET(request: Request) {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const info = await tgApi("getWebhookInfo", {});
  return NextResponse.json({ configurado: telegramConfigurado(), info: info?.result ?? null });
}

export async function POST(request: Request) {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!telegramConfigurado()) {
    return NextResponse.json({ error: "Falta TELEGRAM_BOT_TOKEN." }, { status: 500 });
  }
  if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Falta TELEGRAM_WEBHOOK_SECRET." }, { status: 500 });
  }

  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const url = `https://${host}/api/telegram/webhook`;

  const r = await tgApi("setWebhook", {
    url,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
  });
  const info = await tgApi("getWebhookInfo", {});
  return NextResponse.json({
    ok: !!r?.ok,
    url,
    error: r?.description ?? null,
    info: info?.result ?? null,
  });
}
