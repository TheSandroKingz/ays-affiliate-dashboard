import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { CUENTAS_PROPIAS } from "@/lib/adminId";

// Pendiente de pagar POR MES y por afiliado (solo admin). Para cada mes con
// actividad y cada afiliado real (no las cuentas propias del admin): lo que ganó
// ese mes, lo ya pagado de ese mes y si queda pendiente. Así se ve de un vistazo
// a quién debes de meses anteriores (p. ej. Jeffer del mes pasado).
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: structure } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, display_name, referred_by, subaffiliate_percent")
    .neq("user_id", user.id);

  // Afiliados REALES a los que pagas (no tus cuentas propias tipo Mongolitos).
  const reales = (structure ?? []).filter(
    (a) => !CUENTAS_PROPIAS.has(a.user_id as string)
  );
  const nombre = new Map(reales.map((a) => [a.user_id, a.display_name]));
  const ids = reales.map((a) => a.user_id as string);
  if (!ids.length) return NextResponse.json({ filas: [] });

  const [dailyRes, pagosRes] = await Promise.all([
    supabaseAdmin
      .from("affiliate_daily_stats")
      .select("user_id, date, commission")
      .in("user_id", ids)
      .limit(100000),
    supabaseAdmin
      .from("payments")
      .select("user_id, amount, date")
      .in("user_id", ids)
      .limit(100000),
  ]);

  // Comisión PROPIA por (afiliado, mes).
  const propia = new Map<string, number>();
  for (const d of dailyRes.data ?? []) {
    const mes = String(d.date).slice(0, 7);
    const k = `${d.user_id}|${mes}`;
    propia.set(k, (propia.get(k) ?? 0) + Number(d.commission ?? 0));
  }
  // Ganado = comisión propia + OVERRIDE de subafiliados (lo que un PADRE gana por
  // sus hijos ese mes: pct_padre × comisión_del_hijo). MISMA fórmula que
  // adminStats/saldos (owed = commission + overrideEarned). Sin esto, el
  // "Pendiente por mes" salía CORTO y podías pagar de MENOS a un padre.
  const ganado = new Map(propia);
  const byId = new Map((structure ?? []).map((a) => [a.id as string, a]));
  for (const child of structure ?? []) {
    const parent = child.referred_by ? byId.get(child.referred_by as string) : null;
    if (!parent) continue;
    const pct = Number(parent.subaffiliate_percent ?? 0);
    if (!pct || !nombre.has(parent.user_id as string)) continue;
    for (const [k, com] of propia) {
      const barra = k.indexOf("|");
      if (k.slice(0, barra) !== child.user_id) continue;
      const mes = k.slice(barra + 1);
      const pk = `${parent.user_id}|${mes}`;
      ganado.set(pk, (ganado.get(pk) ?? 0) + (pct / 100) * com);
    }
  }
  // Pagado por (afiliado, mes) — según la fecha del pago.
  const pagado = new Map<string, number>();
  for (const p of pagosRes.data ?? []) {
    const mes = String(p.date).slice(0, 7);
    const k = `${p.user_id}|${mes}`;
    pagado.set(k, (pagado.get(k) ?? 0) + Number(p.amount ?? 0));
  }

  // Una fila por (afiliado, mes) con ganancia > 0.
  const filas = [...ganado.entries()]
    .map(([k, gano]) => {
      const [userId, mes] = k.split("|");
      const pag = pagado.get(k) ?? 0;
      return {
        mes,
        userId,
        nombre: (nombre.get(userId) as string) ?? "—",
        gano,
        pagado: pag,
        pendiente: Math.max(0, gano - pag),
      };
    })
    .filter((f) => f.gano > 0.01)
    // Mes descendente; dentro del mes, primero lo pendiente, luego por nombre.
    .sort((a, b) => {
      if (a.mes !== b.mes) return a.mes < b.mes ? 1 : -1;
      if ((b.pendiente > 0 ? 1 : 0) !== (a.pendiente > 0 ? 1 : 0))
        return (b.pendiente > 0 ? 1 : 0) - (a.pendiente > 0 ? 1 : 0);
      return a.nombre.localeCompare(b.nombre);
    });

  return NextResponse.json({ filas });
}
