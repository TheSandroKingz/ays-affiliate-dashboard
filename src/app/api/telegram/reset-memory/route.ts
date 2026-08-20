import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Reinicia la memoria de todas las conversaciones (para que el bot no siga con
// el tono viejo). Pone un "corte" de fecha: el bot ignora como contexto los
// mensajes anteriores a este momento. NO borra el transcript (se sigue viendo
// en el panel) ni los contactos.
export async function POST(request: Request) {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ahora = new Date().toISOString();
  // Corte de memoria para el bot de Sandro (telegram_contacts) Y para los bots
  // nuevos Jeffer/Livana (bot_contacts): antes solo se reiniciaba Sandro.
  const [rS, rB] = await Promise.all([
    supabaseAdmin.from("telegram_contacts").update({ memory_reset_at: ahora }).neq("chat_id", 0),
    supabaseAdmin.from("bot_contacts").update({ memory_reset_at: ahora }).neq("chat_id", 0),
  ]);
  const error = rS.error || rB.error;
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}
