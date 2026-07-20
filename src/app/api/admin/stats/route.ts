import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Panel de admin = lo que TE LLEVAS LIMPIO:
//   1) Tu link propio: lo que ganas tú directamente (CPA completo de freshbet).
//   2) Tu estructura: el margen de cada afiliado (tu CPA − el suyo) por FTD.
// Total limpio = (1) + (2). Freshbet te muestra el total de todos junto; aquí
// separamos lo que de verdad es tuyo.
type Daily = {
  user_id: string;
  date: string;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

function empty() {
  return { commission: 0, clicks: 0, registrations: 0, ftd: 0 };
}

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

  // Tus afiliados: TODOS los perfiles creados menos tu propia cuenta (esa es
  // "mi link propio"). Así ves cómo va cada uno, incluidos los nuevos.
  const { data: structure, error: sErr } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, display_name, referred_by, subaffiliate_percent")
    .neq("user_id", user.id);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  // % de override por afiliado (para descontar lo que un afiliado gana de sus
  // subafiliados, que sale de tu bolsillo).
  const percentById = new Map<string, number>();
  for (const a of structure ?? []) {
    percentById.set(a.id, Number(a.subaffiliate_percent ?? 0));
  }

  const structIds = (structure ?? []).map((s) => s.user_id);

  // Actividad diaria: la tuya propia + la de tu estructura.
  const idsToLoad = [user.id, ...structIds];
  // Filtro de fechas opcional (?from=YYYY-MM-DD&to=YYYY-MM-DD). Sin filtro = todo.
  // Validamos el formato para que una fecha rara no rompa la consulta.
  const url = new URL(request.url);
  const fechaOk = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const from = fechaOk(url.searchParams.get("from"));
  const to = fechaOk(url.searchParams.get("to"));
  let q = supabaseAdmin
    .from("affiliate_daily_stats")
    .select("user_id, date, commission, clicks, registrations, ftd")
    .in("user_id", idsToLoad);
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data: dailyRaw, error: dErr } = await q;
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  const daily = (dailyRaw ?? []) as Daily[];

  // ---- 1) Tu link propio (tus propias filas) ----
  const own = empty();
  for (const d of daily) {
    if (d.user_id !== user.id) continue;
    own.commission += Number(d.commission ?? 0);
    own.clicks += Number(d.clicks ?? 0);
    own.registrations += Number(d.registrations ?? 0);
    own.ftd += Number(d.ftd ?? 0);
  }

  // ---- 2) Tu estructura (por afiliado) ----
  const byUser = new Map<string, ReturnType<typeof empty>>();
  for (const d of daily) {
    if (d.user_id === user.id) continue;
    const acc = byUser.get(d.user_id) ?? empty();
    acc.commission += Number(d.commission ?? 0);
    acc.clicks += Number(d.clicks ?? 0);
    acc.registrations += Number(d.registrations ?? 0);
    acc.ftd += Number(d.ftd ?? 0);
    byUser.set(d.user_id, acc);
  }

  // Override que gana cada afiliado por sus subafiliados: su % sobre la
  // comisión de los hijos que lo tienen a él como referido. Eso también se lo
  // pagas tú, así que la columna "Le pago" debe incluirlo.
  const overrideEarnedById = new Map<string, number>();
  for (const child of structure ?? []) {
    if (!child.referred_by || child.referred_by === me?.id) continue;
    const parent = (structure ?? []).find((p) => p.id === child.referred_by);
    if (!parent) continue;
    const parentPct = percentById.get(child.referred_by) ?? 0;
    const childCommission = byUser.get(child.user_id)?.commission ?? 0;
    overrideEarnedById.set(
      parent.user_id,
      (overrideEarnedById.get(parent.user_id) ?? 0) + (parentPct / 100) * childCommission
    );
  }

  const stats = (structure ?? [])
    .map((a) => {
      const s = byUser.get(a.user_id) ?? empty();
      const overrideEarned = overrideEarnedById.get(a.user_id) ?? 0;
      const owed = s.commission + overrideEarned; // total que le pagas
      const margin = adminCpa * s.ftd - s.commission;
      return {
        user_id: a.user_id,
        display_name: a.display_name,
        commission: s.commission, // su comisión propia (CPA)
        overrideEarned, // lo que gana de sus subafiliados
        owed, // total a pagarle = comisión + override
        clicks: s.clicks,
        registrations: s.registrations,
        ftd: s.ftd,
        margin, // lo que te quedas tú de él
      };
    })
    .sort((a, b) => b.margin - a.margin);

  const structure_t = stats.reduce(
    (acc, r) => ({
      commission: acc.commission + r.commission,
      clicks: acc.clicks + r.clicks,
      registrations: acc.registrations + r.registrations,
      ftd: acc.ftd + r.ftd,
      margin: acc.margin + r.margin,
    }),
    { commission: 0, clicks: 0, registrations: 0, ftd: 0, margin: 0 }
  );

  // Override que pagas a los "padres": si un afiliado tiene como referido a
  // OTRO afiliado (no a ti), tú pagas al padre su % sobre la comisión del hijo.
  let overridesPaid = 0;
  for (const a of structure ?? []) {
    if (!a.referred_by || a.referred_by === me?.id) continue;
    const parentPct = percentById.get(a.referred_by) ?? 0;
    const childCommission = byUser.get(a.user_id)?.commission ?? 0;
    overridesPaid += (parentPct / 100) * childCommission;
  }

  const totals = {
    ownEarnings: own.commission, // mi link propio (CPA completo)
    structureMargin: structure_t.margin, // mi estructura (margen)
    structurePaid: structure_t.commission, // comisiones propias de afiliados
    overridesPaid, // lo que pago a los padres por sus subafiliados
    structureOwed: structure_t.commission + overridesPaid, // total que pago a afiliados
    // Lo que me llevo limpio = propio + margen − overrides a los padres.
    totalClean: own.commission + structure_t.margin - overridesPaid,
    clicks: own.clicks + structure_t.clicks,
    registrations: own.registrations + structure_t.registrations,
    ftd: own.ftd + structure_t.ftd,
  };

  // ---- Serie diaria combinada (para el gráfico de "lo que me llevo") ----
  // Por día: mi comisión propia + el margen de la estructura ese día.
  const byDate = new Map<
    string,
    { ownCom: number; structCom: number; structFtd: number }
  >();
  for (const d of daily) {
    const key = String(d.date).slice(0, 10);
    const acc = byDate.get(key) ?? { ownCom: 0, structCom: 0, structFtd: 0 };
    if (d.user_id === user.id) {
      acc.ownCom += Number(d.commission ?? 0);
    } else {
      acc.structCom += Number(d.commission ?? 0);
      acc.structFtd += Number(d.ftd ?? 0);
    }
    byDate.set(key, acc);
  }
  const dailySeries = Array.from(byDate.entries())
    .map(([date, v]) => ({
      date,
      earnings: v.ownCom + (adminCpa * v.structFtd - v.structCom),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return NextResponse.json({ adminCpa, stats, totals, own, daily: dailySeries });
}
