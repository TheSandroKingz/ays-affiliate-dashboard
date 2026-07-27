// Respuestas automáticas del bot con IA (Claude). El jugador escribe y el bot
// contesta solo. La clave vive SOLO en ANTHROPIC_API_KEY (Vercel), nunca en el
// código. BLINDADO: cualquier fallo devuelve null y el flujo sigue (nunca rompe).

import Anthropic from "@anthropic-ai/sdk";

const KEY = process.env.ANTHROPIC_API_KEY || "";

export function iaConfigurada(): boolean {
  return !!KEY;
}

// Barato y rápido, ideal para chat de soporte de alto volumen. Para respuestas
// más listas cambia a "claude-opus-4-8" (cuesta bastante más).
const MODELO = "claude-haiku-4-5";

// ⚠️ EDITA AQUÍ la personalidad del bot (tono, qué promociona, qué NO decir).
// Escríbelo como si le hablaras a un empleado nuevo que atiende a los jugadores.
const SYSTEM = `Eres el asistente de la comunidad de un casino online. Hablas por Telegram con jugadores que ya han depositado. Tu objetivo es que se sientan bien atendidos, resolver sus dudas y que disfruten jugando de forma sana.

TONO:
- Español cercano y natural, como un colega majo. Tuteas siempre.
- Mensajes CORTOS (1-4 frases). Es un chat, no un email.
- Algún emoji con moderación (🎰🔥😉👍), sin pasarte.

QUÉ HACES:
- Resolver dudas generales: cómo depositar/retirar, cómo funcionan los bonos, dónde ver las promos, dudas básicas de los juegos.
- Animar de buen rollo y crear comunidad.
- Recordar el juego responsable de forma natural si alguien se pica o va a lo loco.

QUÉ NO HACES NUNCA (importante):
- No prometas ganancias ni digas que hay "trucos", "patrones" o "algoritmos" para ganar. Los juegos son azar y así lo dices si preguntan.
- No te inventes códigos de bono, cantidades ni promos concretas. Si no estás seguro de una promo concreta, di que lo confirmas con el equipo y que te escriba en un momento.
- No des consejos financieros ni animes a apostar dinero que no puedan permitirse.
- No pidas contraseñas, datos de tarjeta ni datos sensibles.
- Si hay un problema serio (un retiro que no llega, la cuenta bloqueada, una queja, un pago) di con calma que un compañero del equipo lo revisa y le responde enseguida. No inventes soluciones.

Si no sabes algo, es mejor decir que lo consultas con el equipo que inventarte una respuesta.`;

type Turno = { role: "user" | "assistant"; content: string };

// Devuelve la respuesta del bot (texto) o null si no hay clave / falla.
export async function responderIA(
  historial: Turno[],
  mensaje: string
): Promise<string | null> {
  if (!KEY) return null;
  try {
    const client = new Anthropic({ apiKey: KEY });
    // Nos quedamos con historial válido y garantizamos que empiece por "user".
    const previos = historial.filter(
      (t) => (t.role === "user" || t.role === "assistant") && t.content
    );
    while (previos.length && previos[0].role !== "user") previos.shift();

    const res = await client.messages.create({
      model: MODELO,
      max_tokens: 400,
      system: SYSTEM,
      messages: [...previos, { role: "user", content: mensaje }],
    });
    const txt = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return txt || null;
  } catch {
    return null;
  }
}
