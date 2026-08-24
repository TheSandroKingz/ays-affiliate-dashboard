import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getGestorBot } from "@/lib/adminAuth";
import { YAIZA_START } from "@/lib/adminId";
import { BOTS } from "@/lib/bots";

// afps de los bots que gestiona Yaiza: Sandro ("bot") + los nuevos
// (Jeffer/Black KP/iAfrika, cada uno con su afp). ⛔ Livana/Mariam (afp "botdm") se
// EXCLUYE a propósito: su enlace de bot es el MISMO que Mariam usa para hablar por
// privado, así que esos depósitos no son realmente trabajo del bot y falsearían el
// dato de Yaiza. Se cuentan solo los bots cuyo tráfico SÍ es del bot.
const AFPS_BOTS = [
  "bot",
  ...Object.values(BOTS)
    .filter((b) => b.key !== "mariam")
    .map((b) => b.afp),
];

// Dinero que ha DEPOSITADO la gente por LOS BOTS (los 5) desde que Yaiza empezó,
// y el de hoy — el importe del depósito (amount), NO la comisión.
// Solo lectura, para el gestor del bot. Blindado.
export async function GET(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Fecha en Madrid, sin asumir offset fijo (Madrid es +01:00 en invierno y
  // +02:00 en verano). Comparamos por la FECHA de Madrid de cada evento.
  const fmtMadrid = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });
  const hoy = fmtMadrid.format(new Date());
  // Límite inferior amplio para la consulta (un día antes de YAIZA_START en UTC,
  // para no perder eventos del borde de medianoche); el filtro fino por fecha de
  // Madrid (>= YAIZA_START) se hace luego fila a fila.
  const desde = new Date(
    Date.parse(`${YAIZA_START}T00:00:00Z`) - 24 * 3600 * 1000
  ).toISOString();

  // El IMPORTE del depósito viene en los eventos de depósito (event_type
  // "redeposit", que Blue manda en TODOS los depósitos, incluido el primero), no
  // en el de comisión (ahí a veces no llega el amount → salía 0). Mismo criterio
  // que "Dinero que metieron" del panel de admin.
  const { data } = await supabaseAdmin
    .from("postback_events")
    .select("amount, created_at")
    .in("afp", AFPS_BOTS)
    .eq("event_type", "redeposit")
    .gte("created_at", desde)
    .limit(100000);

  let total = 0;
  let hoyTotal = 0;
  let nTotal = 0;
  let nHoy = 0;
  for (const e of data ?? []) {
    const md = fmtMadrid.format(new Date(e.created_at as string)); // fecha Madrid del evento
    if (md < YAIZA_START) continue; // fuera del rango (borde de medianoche)
    const c = Number(e.amount ?? 0);
    total += c;
    nTotal++;
    if (md === hoy) {
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
