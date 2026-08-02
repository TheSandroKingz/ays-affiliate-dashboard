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
  const param = new URL(request.url).searchParams.get("mes") || "";

  // Rango de fechas según el período pedido.
  let desde: string;
  let hasta: string;
  let etiqueta: string;
  if (param === "historico") {
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

  const { data: me } = await supabaseAdmin
    .from("affiliates")
    .select("id, cpa_spain")
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: structure } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, display_name, referred_by, subaffiliate_percent")
    .neq("user_id", user.id);

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

  // Reparto por fuente sobre la GANANCIA (margen).
  const splitDe = (nombre: string): { sandro: number; socio: number } => {
    const n = (nombre || "").toLowerCase();
    if (n.includes("jeffer")) return { sandro: 35, socio: 65 };
    if (n.includes("mariam")) return { sandro: 50, socio: 50 };
    return { sandro: 65, socio: 35 };
  };
  const grupos = new Map<string, { nombre: string; ftd: number; ganancia: number }>();
  const sumar = (nombre: string, ftd: number, ganancia: number) => {
    const g = grupos.get(nombre) ?? { nombre, ftd: 0, ganancia: 0 };
    g.ftd += ftd;
    g.ganancia += ganancia;
    grupos.set(nombre, g);
  };
  sumar("General / directo", mes.own.ftd, mes.own.commission);
  for (const s of mes.stats) {
    const ganancia = Number(s.margin ?? 0);
    const n = (s.display_name || "").toLowerCase();
    if (n.includes("jeffer")) sumar("Jeffer", s.ftd, ganancia);
    else if (n.includes("mariam")) sumar("Mariam", s.ftd, ganancia);
    else sumar("General / directo", s.ftd, ganancia);
  }
  const fuentes = [...grupos.values()].map((f) => {
    const sp = splitDe(f.nombre);
    return {
      nombre: f.nombre,
      ftd: f.ftd,
      ganancia: f.ganancia,
      pctSandro: sp.sandro,
      pctSocio: sp.socio,
      sandro: (f.ganancia * sp.sandro) / 100,
      socio: (f.ganancia * sp.socio) / 100,
    };
  });

  return NextResponse.json({
    etiqueta,
    reparto: {
      fuentes,
      sandroTotal: fuentes.reduce((s, f) => s + f.sandro, 0),
      socioTotal: fuentes.reduce((s, f) => s + f.socio, 0),
    },
  });
}
