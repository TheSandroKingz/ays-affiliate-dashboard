import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAdminUser } from "@/lib/adminAuth";

// Diagnóstico rápido del auto-responder: dime si la clave de Claude está y si
// una llamada de prueba funciona. Lo usa el botón "Probar bot" del panel admin
// (con tu sesión). SOLO con sesión de admin: NO se acepta el secreto por la URL
// (metería el secreto del webhook en logs/historial = riesgo de suplantación).
export async function GET(request: Request) {
  const admin = await getAdminUser(request);
  if (!admin) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const key = process.env.ANTHROPIC_API_KEY || "";
  const info: Record<string, unknown> = {
    clave_presente: !!key,
    clave_empieza_por: key ? key.slice(0, 12) + "…" : null,
    telegram_token: !!process.env.TELEGRAM_BOT_TOKEN,
    owner_id: !!process.env.TELEGRAM_OWNER_CHAT_ID,
  };

  if (!key) {
    return NextResponse.json({ ...info, ok: false, motivo: "Falta ANTHROPIC_API_KEY" });
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 20,
      messages: [{ role: "user", content: "di 'ok' y nada más" }],
    });
    const txt = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return NextResponse.json({ ...info, ok: true, respuesta_prueba: txt });
  } catch (e) {
    const err = e as { status?: number; message?: string; error?: unknown };
    return NextResponse.json({
      ...info,
      ok: false,
      status: err?.status ?? null,
      mensaje_error: err?.message ?? String(e),
      detalle: err?.error ?? null,
    });
  }
}
