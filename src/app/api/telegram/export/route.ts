import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// TEMPORAL: leer una conversación para analizar el tono del bot. Protegido por
// secreto en la URL. Borrar tras usar.
const SECRET = "e7ec94affdd588d18c266d1c56dfb8ab";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("s") !== SECRET) {
    return NextResponse.json({ error: "no" }, { status: 401 });
  }
  const q = url.searchParams.get("q") ?? "";

  const { data: cs } = await supabaseAdmin
    .from("telegram_contacts")
    .select("chat_id, first_name, username")
    .or(`first_name.ilike.%${q}%,username.ilike.%${q}%`)
    .limit(10);

  const out: Record<string, unknown> = {};
  for (const c of cs ?? []) {
    const { data: msgs } = await supabaseAdmin
      .from("telegram_messages")
      .select("role, content, created_at")
      .eq("chat_id", c.chat_id as number)
      .order("created_at", { ascending: true })
      .limit(120);
    out[`${c.first_name ?? "?"} (@${c.username ?? "?"}) [${c.chat_id}]`] = (
      msgs ?? []
    ).map((m) => `${m.role === "user" ? "JUGADOR" : "BOT"}: ${m.content}`);
  }
  return NextResponse.json(out, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
