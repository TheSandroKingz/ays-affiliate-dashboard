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
  const { error } = await supabaseAdmin
    .from("telegram_contacts")
    .update({ memory_reset_at: new Date().toISOString() })
    .neq("chat_id", 0);
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}
