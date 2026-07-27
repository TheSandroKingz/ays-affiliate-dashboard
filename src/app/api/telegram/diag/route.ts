import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Diagnóstico rápido del auto-responder: dime si la clave de Claude está y si
// una llamada de prueba funciona. Protegido con el mismo secreto del webhook,
// así puedes abrirlo en el navegador:
//   https://TU-DOMINIO/api/telegram/diag?s=EL_SECRETO
export async function GET(request: Request) {
  const s = new URL(request.url).searchParams.get("s");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || s !== process.env.TELEGRAM_WEBHOOK_SECRET) {
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
