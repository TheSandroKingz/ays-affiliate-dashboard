import { NextResponse } from "next/server";
import { getGestorBot } from "@/lib/adminAuth";
import Anthropic from "@anthropic-ai/sdk";

// Traduce al español un mensaje de un jugador (para el visor de chats de Yaiza,
// cuando escribe en otro idioma). Solo lectura, auth de gestor del bot. La clave
// vive en ANTHROPIC_API_KEY (Vercel). Blindado: cualquier fallo devuelve error
// controlado, nunca rompe.
const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODELO = "claude-sonnet-4-6";

export async function POST(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!KEY) return NextResponse.json({ error: "Traductor no disponible" }, { status: 503 });

  let text = "";
  try {
    const body = await request.json();
    text = String(body?.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "Sin texto" }, { status: 400 });
  if (text.length > 2000) text = text.slice(0, 2000);

  try {
    const client = new Anthropic({ apiKey: KEY });
    const res = await client.messages.create({
      model: MODELO,
      max_tokens: 400,
      system:
        "Traduce al español de España el mensaje del usuario. Devuelve SOLO la traducción, sin comillas, sin explicaciones ni prefijos. Si el texto ya está en español, devuélvelo tal cual. Conserva emojis y el tono coloquial.",
      messages: [{ role: "user", content: text }],
    });
    const bloque = res.content.find((b) => b.type === "text");
    const traduccion = bloque && bloque.type === "text" ? bloque.text.trim() : "";
    return NextResponse.json({ traduccion: traduccion || text });
  } catch {
    return NextResponse.json({ error: "No se pudo traducir" }, { status: 502 });
  }
}
