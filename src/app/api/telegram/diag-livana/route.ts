import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getBot } from "@/lib/bots";
import { tgApi } from "@/lib/telegram";
import { compararSecreto } from "@/lib/secreto";

// TEMPORAL: comprueba los EJEMPLOS (/ejemplo) del bot de Livana (mariam): cuántos
// hay y si el primero se puede ENVIAR (o si quedó guardado como miniatura). BORRAR.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const s = url.searchParams.get("s") || "";
  const bot = getBot("mariam");
  if (!bot) return NextResponse.json({ error: "no bot mariam" });
  if (!compararSecreto(s, bot.secret)) return NextResponse.json({ error: "secreto mal" });
  const chat = Number(url.searchParams.get("chat") || 5394835324);

  const { data: ejs } = await supabaseAdmin
    .from("bot_examples")
    .select("media_type, file_id")
    .eq("bot", "mariam")
    .eq("enabled", true)
    .limit(100);

  const lista = ejs ?? [];
  const map: Record<string, [string, string]> = {
    video: ["sendVideo", "video"],
    animation: ["sendAnimation", "animation"],
    photo: ["sendPhoto", "photo"],
    document: ["sendDocument", "document"],
  };
  const detalle = lista.map((e) => ({
    media_type: e.media_type,
    prefijo: (e.file_id as string | null)?.slice(0, 6) ?? null, // BAAC=video, AAMC=miniatura
  }));

  let envio = null;
  if (lista.length) {
    const e = lista[0];
    const [metodo, campo] = map[(e.media_type as string) ?? "video"] ?? ["sendVideo", "video"];
    const p: Record<string, unknown> = { chat_id: chat, caption: "diag ejemplo 1" };
    p[campo] = e.file_id;
    const r = await tgApi(metodo, p, bot.token);
    envio = { metodo, ok: r?.ok, description: r?.description };
  }

  return NextResponse.json({ total_ejemplos: lista.length, detalle, envio });
}
