import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { CUENTAS_PROPIAS } from "@/lib/adminId";

// Saldos TOTALES (acumulados) por afiliado (solo admin): TODO lo que ha ganado
// (comisión + override de sus subs) menos TODO lo que ya le has pagado = lo
// pendiente REAL. Antes solo miraba el mes en curso y se comía lo que debías de
// meses anteriores sin pagar (p. ej. un afiliado con julio impago aparecía "al
// día"). Ahora refleja la deuda real acumulada. Sirve para pagar sin descuadres.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const DUMMY = "00000000-0000-0000-0000-000000000000";

  const { data: me } = await supabaseAdmin
    .from("affiliates")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: structure } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, referred_by, subaffiliate_percent")
    .neq("user_id", user.id);

  const structIds = (structure ?? []).map((s) => s.user_id);
  const ids = structIds.length ? structIds : [DUMMY];

  // Comisión TOTAL (todo el histórico) por afiliado — no solo el mes.
  const { data: daily } = await supabaseAdmin
    .from("affiliate_daily_stats")
    .select("user_id, commission")
    .in("user_id", ids)
    .limit(100000); // sin límite PostgREST corta en 1000 y descuadraría los saldos
  const comByUser = new Map<string, number>();
  for (const d of daily ?? []) {
    comByUser.set(
      d.user_id,
      (comByUser.get(d.user_id) ?? 0) + Number(d.commission ?? 0)
    );
  }

  // Override que gana cada afiliado por sus subafiliados
  const pctById = new Map<string, number>();
  for (const a of structure ?? []) {
    pctById.set(a.id, Number(a.subaffiliate_percent ?? 0));
  }
  const overrideByUser = new Map<string, number>();
  for (const child of structure ?? []) {
    if (!child.referred_by || child.referred_by === me?.id) continue;
    const parent = (structure ?? []).find((p) => p.id === child.referred_by);
    if (!parent) continue;
    const pct = pctById.get(child.referred_by) ?? 0;
    const childCom = comByUser.get(child.user_id) ?? 0;
    overrideByUser.set(
      parent.user_id,
      (overrideByUser.get(parent.user_id) ?? 0) + (pct / 100) * childCom
    );
  }

  // Pagos TOTALES (todo el histórico) por afiliado.
  const { data: pagos } = await supabaseAdmin
    .from("payments")
    .select("user_id, amount")
    .in("user_id", ids);
  const paidByUser = new Map<string, number>();
  for (const p of pagos ?? []) {
    paidByUser.set(
      p.user_id,
      (paidByUser.get(p.user_id) ?? 0) + Number(p.amount ?? 0)
    );
  }

  const saldos: Record<string, { owed: number; paid: number }> = {};
  for (const a of structure ?? []) {
    // Las CUENTAS PROPIAS del admin (p. ej. Mongolitos) NO se pagan: su comisión
    // ya es margen del propio admin. Si no, el panel diría que te debes dinero a
    // ti mismo y acabarías "pagándote" lo que ya cuentas como tuyo.
    const owed = CUENTAS_PROPIAS.has(a.user_id)
      ? 0
      : (comByUser.get(a.user_id) ?? 0) + (overrideByUser.get(a.user_id) ?? 0);
    saldos[a.user_id] = { owed, paid: paidByUser.get(a.user_id) ?? 0 };
  }

  return NextResponse.json({ saldos });
}
