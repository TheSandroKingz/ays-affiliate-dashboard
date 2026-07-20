import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Registrar un pago a un afiliado (solo admin). Aparece en su historial de
// "Pagos". No toca su balance (el balance es mensual y va aparte).
export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { userId, amount } = await request.json().catch(() => ({}));
  const amt = Number(amount);

  if (!userId || !Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json(
      { error: "Falta el afiliado o el importe no es válido." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("payments").insert({
    user_id: userId,
    amount: amt,
    status: "paid",
    date: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
