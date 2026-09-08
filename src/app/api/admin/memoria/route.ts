import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { computeAdminStats, type DailyRow, type StructRow } from "@/lib/adminStats";

// Memoria del negocio (solo admin): totales por MES cerrado (FTDs, comisión
// pagada a afiliados y tu beneficio), para comparar meses con el tiempo.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: me } = await supabaseAdmin
    .from("affiliates")
    .select("id, cpa_spain")
    .eq("user_id", user.id)
    .maybeSingle();
  const adminCpa = Number(me?.cpa_spain ?? 0);

  const { data: structure } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, display_name, referred_by, subaffiliate_percent")
    .neq("user_id", user.id);
  const struct = (structure ?? []) as StructRow[];
  const structIds = struct.map((s) => s.user_id);
  const idsToLoad = [user.id, ...structIds];

  const { data: dailyRaw, error } = await supabaseAdmin
    .from("affiliate_daily_stats")
    .select("user_id, date, commission, clicks, registrations, ftd")
    .in("user_id", idsToLoad)
    .limit(100000); // sin límite, PostgREST corta en 1000 y el histórico saldría corto
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = (dailyRaw ?? []).map((d) => ({
    ...d,
    date: String(d.date).slice(0, 10),
  })) as DailyRow[];

  // Agrupamos por mes (YYYY-MM) y calculamos los totales de cada uno.
  const porMes = new Map<string, DailyRow[]>();
  for (const d of all) {
    const mes = d.date.slice(0, 7);
    const arr = porMes.get(mes) ?? [];
    arr.push(d);
    porMes.set(mes, arr);
  }

  // Gastos (publicidad, infra…) sumados por mes, para ver la inversión mensual.
  const { data: gastosRaw } = await supabaseAdmin
    .from("gastos")
    .select("fecha, importe")
    .limit(100000);
  const gastosPorMes = new Map<string, number>();
  for (const g of (gastosRaw ?? []) as { fecha: string; importe: number }[]) {
    const mes = String(g.fecha).slice(0, 7);
    gastosPorMes.set(mes, (gastosPorMes.get(mes) ?? 0) + Number(g.importe ?? 0));
  }

  // Penalizaciones (dinero que el casino nos resta a fin de mes). Dato manual por
  // mes. Blindado: si la tabla aún no existe, tratamos todo como 0 (no rompe).
  const penalPorMes = new Map<string, number>();
  try {
    const { data: penalRaw } = await supabaseAdmin
      .from("penalizaciones")
      .select("mes, importe")
      .limit(100000);
    for (const p of (penalRaw ?? []) as { mes: string; importe: number }[]) {
      penalPorMes.set(String(p.mes), Number(p.importe ?? 0));
    }
  } catch {
    /* tabla no creada todavía: penalización = 0 */
  }

  // DEPÓSITOS POR MES. ⚠️ CLAVE: el campo `amount` que manda el casino es el
  // ACUMULADO del jugador, no cada depósito (comprobado: en 1.210 de 1.212
  // jugadores la cifra solo sube). Por eso:
  //  - MEDIA: solo el evento 'ftd' (primer depósito, donde acumulado = depósito),
  //    deduplicando por jugador.
  //  - TOTAL: la DIFERENCIA con el acumulado anterior de ese jugador. Sumar los
  //    importes tal cual multiplicaba el dinero por 7.
  const depoPorMes = new Map<string, { suma: number; n: number; total: number }>();
  const dep = (mes: string) => {
    const a = depoPorMes.get(mes) ?? { suma: 0, n: 0, total: 0 };
    depoPorMes.set(mes, a);
    return a;
  };
  try {
    // Jugadores con la comisión revertida: no cuentan para la media.
    const { data: rev } = await supabaseAdmin
      .from("postback_events")
      .select("player_id")
      .eq("event_type", "commission")
      .eq("status", "counted")
      .eq("counted", false)
      .not("player_id", "is", null)
      .limit(100000);
    const revertidos = new Set((rev ?? []).map((r) => r.player_id as string));

    // Paginado: sin esto PostgREST corta en 1000 y saldría sesgado.
    type FilaDep = {
      amount: number | null; player_id: string | null;
      created_at: string; event_type: string;
    };
    const evs: FilaDep[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data } = await supabaseAdmin
        .from("postback_events")
        .select("amount, player_id, created_at, event_type")
        .in("event_type", ["ftd", "redeposit"])
        .not("amount", "is", null)
        .order("created_at", { ascending: true })
        .range(desde, desde + 999);
      if (!data || !data.length) break;
      evs.push(...(data as FilaDep[]));
      if (data.length < 1000) break;
    }

    const mesDe = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid", year: "numeric", month: "2-digit",
    });
    const acumPrevio = new Map<string, number>(); // último acumulado por jugador
    const vistosFtd = new Set<string>();
    for (const e of evs) {
      const pid = e.player_id;
      const importe = Number(e.amount ?? 0);
      const mes = mesDe.format(new Date(e.created_at)).slice(0, 7);

      // --- TOTAL del mes: lo NUEVO que metió (acumulado - acumulado anterior) ---
      if (pid && importe > 0) {
        const antes = acumPrevio.get(pid) ?? 0;
        if (importe > antes) {
          dep(mes).total += importe - antes;
          acumPrevio.set(pid, importe);
        }
      }

      // --- MEDIA del mes: solo el PRIMER depósito, una vez por jugador ---
      if (e.event_type !== "ftd" || importe <= 0) continue;
      if (pid) {
        if (revertidos.has(pid) || vistosFtd.has(pid)) continue;
        vistosFtd.add(pid);
      }
      const a = dep(mes);
      a.suma += importe;
      a.n += 1;
    }
  } catch {
    /* si algo falla, las columnas salen vacías y la tabla no se rompe */
  }

  const meses = [...porMes.entries()]
    .map(([mes, filas]) => {
      const { totals } = computeAdminStats(filas, user.id, me?.id, adminCpa, struct);
      const penalizacion = penalPorMes.get(mes) ?? 0;
      return {
        mes,
        ftd: totals.ftd,
        // Lo pagado a afiliados incluye comisiones propias + overrides a padres.
        structurePaid: totals.structureOwed,
        // Beneficio ANTES de restar la penalización (por si se quiere ver crudo).
        totalClean: totals.totalClean,
        penalizacion,
        // Beneficio REAL: lo limpio menos lo que el casino nos restó ese mes.
        beneficio: totals.totalClean - penalizacion,
        clicks: totals.clicks,
        registrations: totals.registrations,
        gastos: gastosPorMes.get(mes) ?? 0,
        // Media de lo que deposita un jugador nuevo ese mes (null si no hay datos).
        depositoMedio: depoPorMes.get(mes)?.n
          ? (depoPorMes.get(mes)!.suma / depoPorMes.get(mes)!.n)
          : null,
        depositantes: depoPorMes.get(mes)?.n ?? 0,
        // Dinero NUEVO que entró ese mes (sumando solo los incrementos reales).
        depositadoTotal: depoPorMes.get(mes)?.total ?? 0,
      };
    })
    .sort((a, b) => (a.mes < b.mes ? 1 : -1)); // más reciente primero

  return NextResponse.json({ meses });
}
// La penalización (dinero restado por el casino) NO se edita desde la app: es un
// dato manual que solo se fija por detrás (script con service role). Por eso aquí
// no hay POST — la columna de la Memoria es de solo lectura.
