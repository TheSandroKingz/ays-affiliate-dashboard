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

  // Tope de seguridad ante un typo (8500 en vez de 85): un pago enorme inflaría
  // el "pagado" y ocultaría el pendiente real. Ajustable si algún día hace falta.
  if (amt > 50000) {
    return NextResponse.json(
      { error: "Importe demasiado alto. Revísalo." },
      { status: 400 }
    );
  }

  // El destinatario debe ser un afiliado real (evita grabar un pago contra un
  // user_id equivocado que descuadre su historial).
  const { data: af } = await supabaseAdmin
    .from("affiliates")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!af) {
    return NextResponse.json(
      { error: "Ese afiliado no existe." },
      { status: 400 }
    );
  }

  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // Anti-duplicado: si ya hay un pago IDÉNTICO (mismo afiliado, importe y día) en
  // el último minuto, es un doble envío (doble clic / reintento) → no lo grabamos
  // dos veces (inflaría "pagado" y le pagarías de menos).
  const hace1min = new Date(Date.now() - 60_000).toISOString();
  const { data: dup } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("user_id", userId)
    .eq("amount", amt)
    .gte("created_at", hace1min)
    .limit(1);
  if (dup && dup.length) {
    return NextResponse.json({ ok: true, duplicado: true });
  }

  const { error } = await supabaseAdmin.from("payments").insert({
    user_id: userId,
    amount: amt,
    status: "paid",
    // Fecha CONTABLE en zona Madrid (YYYY-MM-DD), coherente con el filtro
    // mensual de saldos. Con la hora UTC un pago de madrugada del día 1 caía en
    // el mes anterior y dejaba el pendiente inflado. La hora exacta queda en
    // created_at.
    date: hoy,
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
