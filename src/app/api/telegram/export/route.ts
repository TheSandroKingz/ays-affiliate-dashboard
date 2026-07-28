import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Lectura temporal de conversaciones para analizar (secreto del webhook).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const s = url.searchParams.get("s");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || s !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const q = (url.searchParams.get("q") || "").toLowerCase();
  // Buscamos por nombre/username del contacto.
  let chatIds: number[] | null = null;
  if (q) {
    const { data: cs } = await supabaseAdmin
      .from("telegram_contacts")
      .select("chat_id, first_name, username")
      .or(`first_name.ilike.%${q}%,username.ilike.%${q}%`);
    chatIds = (cs ?? []).map((c) => c.chat_id as number);
  }
  let query = supabaseAdmin
    .from("telegram_messages")
    .select("chat_id, role, content, created_at")
    .order("created_at", { ascending: true })
    .limit(400);
  if (chatIds) query = query.in("chat_id", chatIds.length ? chatIds : [-1]);
  const { data } = await query;
  return NextResponse.json({ n: data?.length ?? 0, mensajes: data ?? [] });
}
