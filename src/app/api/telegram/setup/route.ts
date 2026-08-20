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

  // Primero comprobamos que el token del bot es válido.
  const me = await tgApi("getMe", {});
  if (!me?.ok) {
    return NextResponse.json({
      ok: false,
      error:
        "El token del bot no vale (" +
        (me?.description || "Telegram no reconoce el bot") +
        "). Revisa TELEGRAM_BOT_TOKEN en Vercel: pégalo entero, sin espacios ni saltos de línea, y vuelve a hacer Redeploy.",
    });
  }

  // Base URL de CONFIANZA (misma que connect-bot): VERCEL_URL/dominio propio, no
  // el header host del cliente (falsificable). Evita desviar el webhook + secreto.
  const trustedBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const base = trustedBase || `https://${host}`;
  const url = `${base}/api/telegram/webhook`;

  const r = await tgApi("setWebhook", {
    url,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  const info = await tgApi("getWebhookInfo", {});
  const bot = (me.result as { username?: string } | undefined)?.username ?? null;
  return NextResponse.json({
    ok: !!r?.ok,
    url,
    bot,
    error: r?.description ?? null,
    info: info?.result ?? null,
  });
}
