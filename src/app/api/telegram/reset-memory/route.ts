import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Borra la memoria de todas las conversaciones (para que el bot no siga con el
// tono viejo). No borra contactos, solo el historial.
export async function POST(request: Request) {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { error } = await supabaseAdmin
    .from("telegram_contacts")
    .update({ history: [] })
    .neq("chat_id", 0);
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}
