import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { enviarPush } from "@/lib/push";

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
    // Fecha CONTABLE en zona Madrid (YYYY-MM-DD), coherente con el filtro
    // mensual de saldos. Con la hora UTC un pago de madrugada del día 1 caía en
    // el mes anterior y dejaba el pendiente inflado. La hora exacta queda en
    // created_at.
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
    }).format(new Date()),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aviso al afiliado de que le has pagado (sin retrasar la respuesta).
  after(() =>
    enviarPush(userId, {
      title: "💸 Pago recibido",
      body: `Se te ha pagado ${amt.toLocaleString("es-ES")}€. ¡Gracias!`,
      url: "/dashboard/payments",
    })
  );

  return NextResponse.json({ ok: true });
}
