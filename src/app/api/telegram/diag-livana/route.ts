import { NextResponse } from "next/server";
import { getBot } from "@/lib/bots";
import { compararSecreto } from "@/lib/secreto";
import { responderIABot, iaConfigurada } from "@/lib/telegramAI";

// TEMPORAL: prueba la IA del bot de Livana (mariam) con un mensaje de jugador.
// Solo con el secreto correcto en ?s=. Devuelve la respuesta que generaría el
// bot (o el error). BORRAR tras diagnosticar.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const s = url.searchParams.get("s") || "";
  const texto = url.searchParams.get("t") || "hola, ¿qué tal?";
  const bot = getBot("mariam");
  if (!bot) return NextResponse.json({ error: "no bot mariam" });
  if (!compararSecreto(s, bot.secret)) return NextResponse.json({ error: "secreto mal" });

  let respuesta: string | null = null;
  let error: string | null = null;
  const iaOk = iaConfigurada();
  try {
    respuesta = await responderIABot(bot.persona, "", [], texto, null, "Test");
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  return NextResponse.json({
    iaConfigurada: iaOk,
    respuesta,
    respuestaVacia: respuesta === null,
    error,
    personaLen: bot.persona.length,
  });
}
