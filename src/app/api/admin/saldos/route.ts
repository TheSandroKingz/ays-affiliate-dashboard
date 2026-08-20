import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { CUENTAS_PROPIAS } from "@/lib/adminId";

// Saldos por afiliado y MES (solo admin): lo que ganó (comisión + override de
// sus subs) en el mes elegido y lo ya pagado de ese mes = lo pendiente de ESE
// mes. Con ?mes=YYYY-MM se elige el mes (por defecto, el mes en curso). Así se ve
// "cuánto hizo cada uno el mes pasado" para pagarle justo eso, sin mirarlo a mano.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  const mesActual = hoy.slice(0, 7);
  const param = new URL(request.url).searchParams.get("mes") || "";
  const mes = /^\d{4}-\d{2}$/.test(param) ? param : mesActual;
  const from = `${mes}-01`;
  // Hasta el último día del mes elegido; si es el mes en curso, hasta HOY.
  const [yy, mm] = mes.split("-").map(Number);
  const hasta =
    mes === mesActual
      ? hoy
      : new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);

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

  // Comisión del MES elegido por afiliado.
  const { data: daily } = await supabaseAdmin
    .from("affiliate_daily_stats")
    .select("user_id, commission")
    .in("user_id", ids)
    .gte("date", from)
    .lte("date", hasta)
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
  const byId = new Map<string, NonNullable<typeof structure>[number]>();
  for (const a of structure ?? []) {
    pctById.set(a.id, Number(a.subaffiliate_percent ?? 0));
    byId.set(a.id, a); // índice por id para no buscar con .find() dentro del bucle (O(n²)→O(n))
  }
  const overrideByUser = new Map<string, number>();
  for (const child of structure ?? []) {
    if (!child.referred_by || child.referred_by === me?.id) continue;
    const parent = byId.get(child.referred_by);
    if (!parent) continue;
    const pct = pctById.get(child.referred_by) ?? 0;
    const childCom = comByUser.get(child.user_id) ?? 0;
    overrideByUser.set(
      parent.user_id,
      (overrideByUser.get(parent.user_id) ?? 0) + (pct / 100) * childCom
    );
  }

  // Pagos del MES elegido por afiliado.
  const { data: pagos } = await supabaseAdmin
    .from("payments")
    .select("user_id, amount")
    .in("user_id", ids)
    .gte("date", from)
    .lte("date", hasta)
    // Sin límite explícito PostgREST corta en 1000 filas y descuadraría los saldos.
    .limit(100000);
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

  return NextResponse.json({ saldos, mes });
}
