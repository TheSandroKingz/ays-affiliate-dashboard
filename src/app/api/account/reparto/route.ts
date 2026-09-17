import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { leerConfig } from "@/lib/repartoGastosServidor";

// REPARTO DEL AFILIADO CON SUS SOCIOS: lo mismo que el admin tiene con su socio,
// pero para los afiliados que trabajan en equipo (los socios salen de su
// configuración de Gastos). Solo lectura: lo que han ganado en el periodo y el %
// de cada uno. Los % se guardan desde Gastos (PUT /api/account/gastos).
const madridHoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

function rango(param: string | null): { desde: string | null; hasta: string | null; mesVista: string | null } {
  if (param === "todo") return { desde: null, hasta: null, mesVista: null };
  const hoy = madridHoy();
  const mes = param && /^\d{4}-\d{2}$/.test(param) ? param : hoy.slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { desde: `${mes}-01`, hasta: mes === hoy.slice(0, 7) ? hoy : ultimo, mesVista: mes };
}

export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { desde, hasta, mesVista } = rango(new URL(request.url).searchParams.get("mes"));
  let q = supabaseAdmin
    .from("affiliate_daily_stats")
    .select("date, commission, ftd")
    .eq("user_id", user.id)
    .limit(5000);
  if (desde) q = q.gte("date", desde);
  if (hasta) q = q.lte("date", hasta);
  const [{ data: stats, error }, cfg] = await Promise.all([q, leerConfig(user.id)]);
  if (error || cfg.error) return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });

  const ganado = (stats ?? []).reduce((s, r) => s + Number(r.commission ?? 0), 0);
  const ftd = (stats ?? []).reduce((s, r) => s + Number(r.ftd ?? 0), 0);
  // Gastos del periodo: para decir también lo que queda limpio tras los gastos.
  // Si esa consulta falla, se dice que NO se sabe en vez de enseñar un 0 € falso.
  let gastado: number | null = 0;
  {
    let g = supabaseAdmin.from("gastos_afiliados").select("importe").eq("user_id", user.id).limit(1000);
    if (desde) g = g.gte("fecha", desde);
    if (hasta) g = g.lte("fecha", hasta);
    const { data, error: eg } = await g;
    gastado = eg ? null : (data ?? []).reduce((s, r) => s + Number(r.importe ?? 0), 0);
  }

  return NextResponse.json({ ganado, ftd, gastado, config: cfg.config, mesVista });
}
