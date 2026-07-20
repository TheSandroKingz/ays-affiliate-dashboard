import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";

// Registra una visita del afiliado a su dashboard (contador por día). BLINDADO:
// si la tabla/función no existen, no rompe nada.
export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  await supabaseAdmin
    .rpc("increment_visit", { p_user_id: user.id, p_date: hoy })
    .then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}
