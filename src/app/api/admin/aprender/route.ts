import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// "Aprender": lee las conversaciones reales de los últimos días, detecta las
// preguntas/problemas que MÁS se repiten y PROPONE respuestas para que el dueño
// las apruebe (se guardan en bot_faq y el bot las usa). Solo admin. Blindado.

const MODELO = "claude-haiku-4-5"; // barato y de sobra para agrupar temas (bajo demanda)

const SYSTEM = `Eres un analista que ayuda a mejorar un BOT de Telegram de soporte de un creador que enseña a jugar a las "Mines" en la web Celsius. Te paso MENSAJES REALES de jugadores (lo que ellos escriben al bot). Tu tarea: encontrar las PREGUNTAS, DUDAS y PROBLEMAS que MÁS SE REPITEN y que el bot podría responder mejor.

Para cada tema frecuente, propón una RESPUESTA corta y útil que el bot podrá reutilizar, en tono de colega cercano (tuteo), SIEMPRE honesta:
- NUNCA prometas que van a ganar ni que el patrón "no falla".
- NUNCA normalices perder ("eso pasa", "es azar"…) ni animes a meter más dinero para "recuperar" lo perdido.
- Si es un problema técnico (registro, depósito, retiro, bono, región…), da pasos concretos y reales.
- Sé breve (1-3 frases por respuesta), como un WhatsApp.

Devuelve EXCLUSIVAMENTE un JSON válido, sin texto alrededor, con esta forma:
[{"tema":"resumen corto del tema","ejemplos":["frase real 1","frase real 2"],"respuesta":"la respuesta que usaría el bot"}]
Máximo 8 temas, ordenados del más frecuente/útil al menos. Si no hay material suficiente, devuelve [].`;

function extraerJson(txt: string): unknown[] {
  try {
    return JSON.parse(txt);
  } catch {
    const a = txt.indexOf("[");
    const b = txt.lastIndexOf("]");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(txt.slice(a, b + 1));
      } catch {
        return [];
      }
    }
    return [];
  }
}

export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const KEY = process.env.ANTHROPIC_API_KEY || "";
  if (!KEY) {
    return NextResponse.json({ error: "IA no configurada" }, { status: 500 });
  }

  // Ventana: últimos 3 días. Nos quedamos con lo que ESCRIBE la gente (role user),
  // que es donde están las preguntas/problemas a aprender. Cap para acotar coste.
  const desde = new Date(Date.now() - 3 * 86400000).toISOString();
  const [tg, bm] = await Promise.all([
    supabaseAdmin
      .from("telegram_messages")
      .select("content, created_at")
      .eq("role", "user")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(400),
    supabaseAdmin
      .from("bot_messages")
      .select("content, created_at")
      .eq("role", "user")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(200)
      .then((r) => r, () => ({ data: [] as { content: string }[] })),
  ]);

  const mensajes = [
    ...((tg.data ?? []) as { content: string }[]),
    ...((bm.data ?? []) as { content: string }[]),
  ]
    .map((m) => String(m.content ?? "").replace(/\s+/g, " ").trim())
    .filter((c) => c && c.length > 1 && !/^\[/.test(c)) // fuera los "[foto]"/"[vídeo]"
    .slice(0, 500);

  if (mensajes.length < 8) {
    return NextResponse.json({ sugerencias: [], pocos: true });
  }

  const transcript = mensajes.map((c) => `- ${c}`).join("\n").slice(0, 24000);

  try {
    const client = new Anthropic({ apiKey: KEY });
    const res = await client.messages.create({
      model: MODELO,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Estos son los mensajes de los jugadores de los últimos días. Sácame los temas más repetidos y propón respuestas:\n\n${transcript}`,
        },
      ],
    });
    const txt = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const arr = extraerJson(txt);
    const sugerencias = (Array.isArray(arr) ? arr : [])
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        tema: String(x.tema ?? "").trim().slice(0, 200),
        ejemplos: Array.isArray(x.ejemplos)
          ? x.ejemplos.map((e) => String(e).trim().slice(0, 200)).slice(0, 4)
          : [],
        respuesta: String(x.respuesta ?? "").trim().slice(0, 1000),
      }))
      .filter((x) => x.respuesta)
      .slice(0, 8);
    return NextResponse.json({ sugerencias, analizados: mensajes.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fallo al analizar" },
      { status: 500 }
    );
  }
}
