import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getGestorBot } from "@/lib/adminAuth";
import { YAIZA_START } from "@/lib/adminId";

// Dinero que ha DEPOSITADO la gente por el BOT de Sandro (afp="bot") desde que
// Yaiza empezó, y el de hoy — el importe del depósito (amount), NO la comisión.
// Solo lectura, para el gestor del bot. Blindado.
export async function GET(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const desde = new Date(`${YAIZA_START}T00:00:00+02:00`).toISOString();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const hoyDesde = new Date(`${hoy}T00:00:00+02:00`).toISOString();

  // El IMPORTE del depósito viene en los eventos de depósito (event_type
  // "redeposit", que Blue manda en TODOS los depósitos, incluido el primero), no
  // en el de comisión (ahí a veces no llega el amount → salía 0). Mismo criterio
  // que "Dinero que metieron" del panel de admin.
  const { data } = await supabaseAdmin
    .from("postback_events")
    .select("amount, created_at")
    .eq("afp", "bot")
    .eq("event_type", "redeposit")
    .gte("created_at", desde)
    .limit(100000);

  let total = 0;
  let hoyTotal = 0;
  let nTotal = 0;
  let nHoy = 0;
  for (const e of data ?? []) {
    const c = Number(e.amount ?? 0);
    total += c;
    nTotal++;
    if ((e.created_at as string) >= hoyDesde) {
      hoyTotal += c;
      nHoy++;
    }
  }
  return NextResponse.json({
    desde: YAIZA_START,
    total,
    hoy: hoyTotal,
    qftdTotal: nTotal,
    qftdHoy: nHoy,
  });
}
