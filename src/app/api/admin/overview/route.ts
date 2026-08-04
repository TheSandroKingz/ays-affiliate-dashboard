import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { computeAdminStats, type DailyRow, type StructRow } from "@/lib/adminStats";
import { resumenSeguridad, saludFreshbet } from "@/lib/seguridad";

// Vista consolidada del INICIO del admin: mes en curso + mes pasado (para la
// comparativa "a estas alturas") + seguridad + solicitudes pendientes. La
// consulta de datos va ACOTADA a esos 2 meses (no todo el histórico), y todo lo
// independiente va en paralelo. Menos descarga y menos round-trips.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Rangos (zona Madrid). Se calculan ya para acotar la consulta a 2 meses.
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  const inicioMes = hoy.slice(0, 7) + "-01";
  // Instante UTC equivalente al inicio de mes EN MADRID. postback_events.created_at
  // es UTC; si filtráramos por "YYYY-MM-01" (medianoche UTC) perderíamos las
  // primeras ~2h del día 1 en hora Madrid. Restamos el offset de Madrid de ahora.
  const offMadrid = Number(
    (
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Madrid",
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? "GMT+0"
    ).match(/GMT([+-]\d+)/)?.[1] ?? "0"
  );
  const inicioMesUtc = new Date(
    Date.parse(inicioMes + "T00:00:00Z") - offMadrid * 3600_000
  ).toISOString();
  const [y, m] = hoy.split("-").map(Number);
  const finPrev = new Date(Date.UTC(y, m - 1, 1));
  finPrev.setUTCDate(0);
  const finMesPasado = finPrev.toISOString().slice(0, 10);
  const inicioMesPasado = finMesPasado.slice(0, 7) + "-01";

  // La estructura debe resolverse antes de la consulta diaria (define idsToLoad).
  const { data: structure, error: sErr } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, display_name, referred_by, subaffiliate_percent")
    .neq("user_id", user.id);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const structIds = (structure ?? []).map((s) => s.user_id);
  const idsToLoad = [user.id, ...structIds];

  // Todo lo demás en paralelo. La consulta diaria viene ACOTADA por fecha (mes
  // pasado en adelante); antes traía TODO el histórico en cada carga.
  const [meRes, dailyRes, histDailyRes, pendRes, seguridad, freshbet, paisesRes] =
    await Promise.all([
      supabaseAdmin
        .from("affiliates")
        .select("id, cpa_spain")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("affiliate_daily_stats")
        .select("user_id, date, commission, clicks, registrations, ftd")
        .in("user_id", idsToLoad)
        .gte("date", inicioMesPasado)
        .limit(100000), // sin límite PostgREST corta en 1000 → "Lo que me quedo" saldría corto al crecer
      // TODO el histórico (sin acotar fecha) para el "Total generado" del tooltip.
      supabaseAdmin
        .from("affiliate_daily_stats")
        .select("user_id, date, commission, clicks, registrations, ftd")
        .in("user_id", idsToLoad)
        .limit(100000),
      supabaseAdmin
        .from("affiliates")
        .select("user_id", { count: "exact", head: true })
        .eq("approved", false),
      resumenSeguridad(),
      saludFreshbet(),
      supabaseAdmin
        .from("postback_events")
        .select("isocountry")
        .in("event_type", ["ftd", "commission"])
        .eq("counted", true)
        // Solo el MES en curso (se reinicia cada mes, como el resto del panel), no
        // el histórico. Usamos el inicio de mes de Madrid en UTC (inicioMesUtc)
        // para no perder las primeras horas del día 1.
        .gte("created_at", inicioMesUtc)
        .limit(100000), // sin límite se cortaría en 1000 y el histograma saldría corto
    ]);

  const adminCpa = Number(meRes.data?.cpa_spain ?? 0);
  const meId = meRes.data?.id;

  // De dónde vienen los jugadores (países de los QFTD/FTD contados).
  const paisesMap = new Map<string, number>();
  for (const r of paisesRes.data ?? []) {
    const c = (r.isocountry || "").toUpperCase() || "??";
    paisesMap.set(c, (paisesMap.get(c) ?? 0) + 1);
  }
  const paises = [...paisesMap.entries()]
    .map(([code, n]) => ({ code, n }))
    .sort((a, b) => b.n - a.n);

  if (dailyRes.error) {
    return NextResponse.json({ error: dailyRes.error.message }, { status: 500 });
  }

  const all = (dailyRes.data ?? []).map((d) => ({
    ...d,
    date: String(d.date).slice(0, 10),
  })) as DailyRow[];
  const struct = (structure ?? []) as StructRow[];

  const enRango = (a: string, b: string) =>
    all.filter((d) => d.date >= a && d.date <= b);

  const mes = computeAdminStats(
    enRango(inicioMes, hoy),
    user.id,
    meId,
    adminCpa,
    struct
  );

  // Comparativa "a estas alturas": beneficio limpio del mes pasado hasta el
  // MISMO día del mes (para comparar con el actual de forma justa).
  const dia = Number(hoy.slice(8, 10));
  const finMesPasadoDia = Number(finMesPasado.slice(8, 10));
  const mismoDia = Math.min(dia, finMesPasadoDia);
  const lastMonthSameDay =
    inicioMesPasado.slice(0, 7) + "-" + String(mismoDia).padStart(2, "0");
  const lastMonthToDateClean = computeAdminStats(
    enRango(inicioMesPasado, lastMonthSameDay),
    user.id,
    meId,
    adminCpa,
    struct
  ).totals.totalClean;

  // Total generado HISTÓRICO (de todo el tiempo, aunque ya se haya cobrado): lo
  // que has ganado limpio desde el primer día. Como el afiliado, para el tooltip.
  const histRows = (histDailyRes.data ?? []).map((d) => ({
    ...d,
    date: String(d.date).slice(0, 10),
  })) as DailyRow[];
  const totalGenerado = computeAdminStats(
    histRows,
    user.id,
    meId,
    adminCpa,
    struct
  ).totals.totalClean;

  // ── REPARTO CON EL SOCIO (del MES en curso) ──────────────────────────────
  // El % que te llevas TÚ (Sandro) varía según de dónde venga el dinero. Se
  // aplica sobre la GANANCIA/MARGEN de cada fuente (lo que SOBRA tras pagar al
  // afiliado su CPA; p. ej. de Jeffer son 85-50=35€/FTD), que es lo que se
  // reparte — NO sobre los 85€ brutos. Jeffer/Mariam se detectan por su nombre.
  const splitDe = (nombre: string): { sandro: number; socio: number } => {
    const n = (nombre || "").toLowerCase();
    if (n.includes("jeffer")) return { sandro: 35, socio: 65 };
    if (n.includes("mariam")) return { sandro: 50, socio: 50 };
    return { sandro: 65, socio: 35 }; // general / directo (tú, Mongolitos, otros)
  };
  const grupos = new Map<string, { nombre: string; ftd: number; generado: number }>();
  const sumar = (nombre: string, ftd: number, generado: number) => {
    const g = grupos.get(nombre) ?? { nombre, ftd: 0, generado: 0 };
    g.ftd += ftd;
    g.generado += generado;
    grupos.set(nombre, g);
  };
  // Tu tráfico directo (tu propio link) → General.
  sumar("General / directo", mes.own.ftd, mes.own.commission);
  for (const s of mes.stats) {
    // GANANCIA/margen de esa fuente (lo que SOBRA tras pagar al afiliado su CPA).
    // Para Jeffer/Mariam = 85-50 = 35€/FTD; para Mongolitos/propias = su comisión
    // entera. Es lo que se reparte con el socio.
    const ganancia = Number(s.margin ?? 0);
    const n = (s.display_name || "").toLowerCase();
    if (n.includes("jeffer")) sumar("Jeffer", s.ftd, ganancia);
    else if (n.includes("mariam")) sumar("Mariam", s.ftd, ganancia);
    else sumar("General / directo", s.ftd, ganancia); // Mongolitos y demás → General
  }
  const fuentes = [...grupos.values()].map((f) => {
    const sp = splitDe(f.nombre === "Jeffer" || f.nombre === "Mariam" ? f.nombre : "");
    return {
      nombre: f.nombre,
      ftd: f.ftd,
      generado: f.generado,
      pctSandro: sp.sandro,
      pctSocio: sp.socio,
      sandro: (f.generado * sp.sandro) / 100,
      socio: (f.generado * sp.socio) / 100,
    };
  });
  const reparto = {
    fuentes,
    sandroTotal: fuentes.reduce((s, f) => s + f.sandro, 0),
    socioTotal: fuentes.reduce((s, f) => s + f.socio, 0),
  };

  return NextResponse.json({
    adminCpa,
    seguridad,
    freshbet,
    lastMonthToDateClean,
    totalGenerado,
    reparto,
    paises,
    month: { stats: mes.stats, totals: mes.totals, daily: mes.daily },
    pending: pendRes.count ?? 0,
  });
}
