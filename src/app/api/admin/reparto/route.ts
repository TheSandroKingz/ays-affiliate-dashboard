import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { computeAdminStats, type DailyRow, type StructRow } from "@/lib/adminStats";

// Reparto de GANANCIAS con el socio, para un PERÍODO elegible: mes en curso, un
// mes concreto (?mes=YYYY-MM) o TODO el histórico (?mes=historico). El % que se
// lleva cada uno varía por fuente y se aplica sobre el MARGEN (lo que sobra tras
// pagar el CPA del afiliado), no sobre el bruto. Solo admin.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  const mesActual = hoy.slice(0, 7);
  const url = new URL(request.url);
  const dia = url.searchParams.get("dia") || "";
  const param = url.searchParams.get("mes") || "";

  // Rango de fechas según el período pedido.
  let desde: string;
  let hasta: string;
  let etiqueta: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    // Un DÍA suelto (p. ej. hoy, para ver un día bueno).
    desde = dia;
    hasta = dia;
    etiqueta = dia;
  } else if (param === "historico") {
    desde = "2000-01-01";
    hasta = hoy;
    etiqueta = "Histórico (todo)";
  } else if (/^\d{4}-\d{2}$/.test(param)) {
    const [yy, mm] = param.split("-").map(Number);
    desde = `${param}-01`;
    // Último día del mes pedido; si es el mes en curso, hasta HOY.
    hasta =
      param === mesActual
        ? hoy
        : new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
    etiqueta = param;
  } else {
    desde = `${mesActual}-01`;
    hasta = hoy;
    etiqueta = mesActual;
  }

  // me y structure son independientes → en paralelo (1 round-trip en vez de 2).
  const [{ data: me }, { data: structure }] = await Promise.all([
    supabaseAdmin.from("affiliates").select("id, cpa_spain").eq("user_id", user.id).maybeSingle(),
    supabaseAdmin
      .from("affiliates")
      .select("id, user_id, display_name, referred_by, subaffiliate_percent")
      .neq("user_id", user.id),
  ]);

  const adminCpa = Number(me?.cpa_spain ?? 0);
  const meId = me?.id;
  const struct = (structure ?? []) as StructRow[];
  const idsToLoad = [user.id, ...struct.map((s) => s.user_id)];

  const { data: daily } = await supabaseAdmin
    .from("affiliate_daily_stats")
    .select("user_id, date, commission, clicks, registrations, ftd")
    .in("user_id", idsToLoad)
    .gte("date", desde)
    .lte("date", hasta)
    .limit(100000);

  const rows = (daily ?? []).map((d) => ({
    ...d,
    date: String(d.date).slice(0, 10),
  })) as DailyRow[];
  const mes = computeAdminStats(rows, user.id, meId, adminCpa, struct);

  // Reparto por fuente sobre la GANANCIA (margen). El % de cada uno va por
  // afiliado identificado por su USER_ID (NO por el nombre): así no se rompe
  // aunque renombres la cuenta ("Jeffer17"/"Mariam"). Cualquier otro afiliado, y
  // el tráfico directo del admin, cae en "General / directo".
  type Split = { grupo: string; sandro: number; socio: number };
  const REPARTO_POR_USUARIO: Record<string, Split> = {
    "13dd6a9d-2365-4ebb-923b-009e795aff51": { grupo: "Jeffer", sandro: 35, socio: 65 }, // Jeffer17
    "89a1c478-2282-44ed-b7b1-bd1f4d1b154c": { grupo: "Mariam", sandro: 50, socio: 50 }, // Mariam
  };
  const GENERAL: Split = { grupo: "General / directo", sandro: 65, socio: 35 };

  const grupos = new Map<string, { nombre: string; ftd: number; ganancia: number; sandro: number; socio: number }>();
  const sumar = (cfg: Split, ftd: number, ganancia: number) => {
    const g =
      grupos.get(cfg.grupo) ??
      { nombre: cfg.grupo, ftd: 0, ganancia: 0, sandro: cfg.sandro, socio: cfg.socio };
    g.ftd += ftd;
    g.ganancia += ganancia;
    grupos.set(cfg.grupo, g);
  };
  sumar(GENERAL, mes.own.ftd, mes.own.commission);
  for (const s of mes.stats) {
    const cfg = REPARTO_POR_USUARIO[s.user_id] ?? GENERAL;
    sumar(cfg, s.ftd, Number(s.margin ?? 0));
  }
  // Descontar del pool los OVERRIDES que el admin ya pagó a los afiliados-padre
  // por sus subafiliados: ese dinero ya salió y NO se reparte con el socio. Se
  // imputa a "General / directo" para que la suma cuadre con la ganancia limpia
  // (totalClean también resta overridesPaid). Sin esto el socio cobraba de más.
  const overridesPaid = Number(mes.totals?.overridesPaid ?? 0);
  if (overridesPaid > 0) {
    const g = grupos.get(GENERAL.grupo);
    if (g) g.ganancia -= overridesPaid;
  }
  const fuentes = [...grupos.values()].map((f) => ({
    nombre: f.nombre,
    ftd: f.ftd,
    ganancia: f.ganancia,
    pctSandro: f.sandro,
    pctSocio: f.socio,
    sandro: (f.ganancia * f.sandro) / 100,
    socio: (f.ganancia * f.socio) / 100,
  }));

  return NextResponse.json({
    etiqueta,
    reparto: {
      fuentes,
      sandroTotal: fuentes.reduce((s, f) => s + f.sandro, 0),
      socioTotal: fuentes.reduce((s, f) => s + f.socio, 0),
    },
  });
}
