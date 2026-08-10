import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// FAQ del bot ("Aprender"): respuestas aprobadas por el dueño que el bot usa.
// GET = lista, POST = añadir {tema, respuesta}, DELETE ?id= = borrar. Solo admin.

export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("bot_faq")
    .select("id, tema, respuesta, enabled, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    // Tabla aún sin crear u otro fallo: no rompas el panel.
    return NextResponse.json({ faq: [], aviso: "sin_tabla" });
  }
  return NextResponse.json({ faq: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let body: { tema?: string; respuesta?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const tema = String(body.tema ?? "").trim().slice(0, 200);
  const respuesta = String(body.respuesta ?? "").trim().slice(0, 1000);
  if (!respuesta) {
    return NextResponse.json({ error: "Falta la respuesta" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("bot_faq")
    .insert({ tema: tema || "General", respuesta })
    .select("id, tema, respuesta, enabled, created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const { error } = await supabaseAdmin.from("bot_faq").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
