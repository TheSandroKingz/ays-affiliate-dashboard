import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Exporta las últimas conversaciones (para analizarlas). Protegido con el
// secreto del webhook. TEMPORAL: se puede borrar tras el análisis.
export async function GET(request: Request) {
  const s = new URL(request.url).searchParams.get("s");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || s !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const { data } = await supabaseAdmin
    .from("telegram_messages")
    .select("chat_id, role, content, created_at")
    .order("created_at", { ascending: true })
    .limit(400);
  return NextResponse.json({ n: data?.length ?? 0, mensajes: data ?? [] });
}
