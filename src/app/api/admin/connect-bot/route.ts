import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getBot } from "@/lib/bots";
import { tgApi } from "@/lib/telegram";

// Conecta (o reconecta) el WEBHOOK de un bot NUEVO (Jeffer/Livana) a ESTA web,
// usando su token y su secreto del entorno. Útil al cambiar el token de un bot
// (p. ej. bot nuevo): Telegram deja de mandarle updates hasta que se re-apunta.
// Solo admin. Corre en el servidor, que tiene el token/secreto en Vercel.
export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const key = String(body?.key ?? "").trim();
  const bot = getBot(key);
  if (!bot) return NextResponse.json({ error: "Bot desconocido." }, { status: 400 });
  if (!bot.token) return NextResponse.json({ error: "Falta el TOKEN del bot en Vercel." }, { status: 400 });
  if (!bot.secret) return NextResponse.json({ error: "Falta el SECRETO del webhook del bot en Vercel." }, { status: 400 });

  // Comprobamos que el token es válido y de qué bot es.
  const me = await tgApi("getMe", {}, bot.token);
  if (!me?.ok) {
    return NextResponse.json({
      ok: false,
      error:
        "El token no vale (" +
        (me?.description || "Telegram no reconoce el bot") +
        "). Revisa el token en Vercel: pégalo entero, sin espacios ni saltos de línea, y Redeploy.",
    });
  }

  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const url = `https://${host}/api/telegram/webhook/${bot.key}`;
  const r = await tgApi(
    "setWebhook",
    {
      url,
      secret_token: bot.secret,
      allowed_updates: ["message", "callback_query"],
    },
    bot.token
  );
  const info = await tgApi("getWebhookInfo", {}, bot.token);
  const username = (me.result as { username?: string } | undefined)?.username ?? null;
  return NextResponse.json({
    ok: !!r?.ok,
    url,
    bot: username,
    error: r?.description ?? null,
    info: info?.result ?? null,
  });
}
