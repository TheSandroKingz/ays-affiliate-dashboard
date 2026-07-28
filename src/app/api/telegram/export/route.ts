import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// TEMPORAL: leer conversaciones para analizar el tono del bot. Protegido por
// secreto en la URL. Borrar tras usar.
const SECRET = "e7ec94affdd588d18c266d1c56dfb8ab";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("s") !== SECRET) {
    return NextResponse.json({ error: "no" }, { status: 401 });
  }
  const q = url.searchParams.get("q");

  // Últimos chats activos, o uno concreto por nombre/username.
  let chatIds: number[] = [];
  if (q) {
    const { data } = await supabaseAdmin
      .from("telegram_contacts")
      .select("chat_id, first_name, username")
      .or(`first_name.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(10);
    chatIds = (data ?? []).map((c) => c.chat_id as number);
  } else {
    // El chat con el mensaje más reciente.
    const { data } = await supabaseAdmin
      .from("telegram_messages")
      .select("chat_id")
      .order("created_at", { ascending: false })
      .limit(1);
    chatIds = (data ?? []).map((m) => m.chat_id as number);
  }

  const out: Record<string, unknown> = {};
  for (const id of chatIds) {
    const { data: c } = await supabaseAdmin
      .from("telegram_contacts")
      .select("first_name, username")
      .eq("chat_id", id)
      .maybeSingle();
    const { data: msgs } = await supabaseAdmin
      .from("telegram_messages")
      .select("role, content, created_at")
      .eq("chat_id", id)
      .order("created_at", { ascending: true })
      .limit(80);
    out[`${c?.first_name ?? "?"} (@${c?.username ?? "?"}) [${id}]`] = (
      msgs ?? []
    ).map((m) => `${m.role === "user" ? "JUGADOR" : "BOT"}: ${m.content}`);
  }
  return NextResponse.json(out, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
