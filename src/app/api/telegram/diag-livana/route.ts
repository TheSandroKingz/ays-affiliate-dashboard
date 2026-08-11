import { NextResponse } from "next/server";
import { getBot } from "@/lib/bots";
import { tgApi } from "@/lib/telegram";
import { compararSecreto } from "@/lib/secreto";
import { procesarUpdate } from "@/lib/botHandler";

// TEMPORAL: diagnóstico del bot de Livana (mariam). Solo funciona con el secreto
// correcto en ?s=. Ejecuta un /start por dentro (?chat=<id>) y devuelve el error
// exacto si lo hay. BORRAR tras diagnosticar.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const s = url.searchParams.get("s") || "";
  const bot = getBot("mariam");
  if (!bot) return NextResponse.json({ error: "no bot mariam" });

  const me = await tgApi("getMe", {}, bot.token);
  const matches = compararSecreto(s, bot.secret);
  let processError: string | null = null;
  let processed = false;
  const chat = Number(url.searchParams.get("chat") || 0);
  if (matches && chat) {
    try {
      await procesarUpdate(bot, {
        update_id: Date.now(),
        message: {
          message_id: 1,
          from: { id: chat, is_bot: false, first_name: "Diag", username: "diag" },
          chat: { id: chat, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/start",
          entities: [{ offset: 0, length: 6, type: "bot_command" }],
        },
      });
      processed = true;
    } catch (e) {
      processError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  }
  return NextResponse.json({
    botUsername: (me?.result as { username?: string } | undefined)?.username ?? null,
    tokenOk: !!me?.ok,
    secretLen: bot.secret.length,
    secretMatches: matches,
    ownerSet: !!bot.owner,
    processed,
    processError,
  });
}
