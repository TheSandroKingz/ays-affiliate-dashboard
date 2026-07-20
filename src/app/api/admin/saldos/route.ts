import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Saldos del MES en curso por afiliado (solo admin): lo que gana (comisión +
// override de sus subs), lo ya pagado este mes, y lo pendiente. Sirve para
// pagar "lo que debes" de un toque sin mirar Estadísticas y escribirlo a mano.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  const from = hoy.slice(0, 7) + "-01";
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

  // Comisión del mes por afiliado
  const { data: daily } = await supabaseAdmin
    .from("affiliate_daily_stats")
    .select("user_id, commission")
    .in("user_id", ids)
    .gte("date", from)
    .lte("date", hoy);
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

  // Pagos del mes por afiliado
  const { data: pagos } = await supabaseAdmin
    .from("payments")
    .select("user_id, amount")
    .in("user_id", ids)
    .gte("date", from);
  const paidByUser = new Map<string, number>();
  for (const p of pagos ?? []) {
    paidByUser.set(
      p.user_id,
      (paidByUser.get(p.user_id) ?? 0) + Number(p.amount ?? 0)
    );
  }

  const saldos: Record<string, { owed: number; paid: number }> = {};
  for (const a of structure ?? []) {
    const owed =
      (comByUser.get(a.user_id) ?? 0) + (overrideByUser.get(a.user_id) ?? 0);
    saldos[a.user_id] = { owed, paid: paidByUser.get(a.user_id) ?? 0 };
  }

  return NextResponse.json({ saldos });
}
