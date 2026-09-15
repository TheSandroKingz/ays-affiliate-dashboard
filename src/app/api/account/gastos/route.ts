import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { rateLimitShared } from "@/lib/rateLimit";
import { leerReparto, guardarReparto } from "@/lib/repartoGastosServidor";

// GASTOS DEL AFILIADO: como el apartado de Gastos del admin, pero sin categorías
// ni reparto. El concepto y QUIÉN lo pagó los escribe él (hay afiliados que
// trabajan en equipo).
//  - GET ?mes=YYYY-MM | ?mes=todo → sus gastos del periodo, lo ganado en él y los
//    nombres que ya ha usado en "Pagó" (para sugerírselos).
//  - POST { fecha, pagado_por, concepto, importe } → añade.
//  - PATCH { id, fecha, pagado_por, concepto, importe } → edita uno SUYO.
//  - DELETE ?id= → borra uno SUYO.
// Cada afiliado solo ve y toca los suyos: el filtro por su user_id va en servidor.

const madridHoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

function rango(param: string | null): { desde: string | null; hasta: string | null; mesVista: string | null } {
  if (param === "todo") return { desde: null, hasta: null, mesVista: null };
  const hoy = madridHoy();
  const mes = param && /^\d{4}-\d{2}$/.test(param) ? param : hoy.slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { desde: `${mes}-01`, hasta: mes === hoy.slice(0, 7) ? hoy : ultimo, mesVista: mes };
}

// "12,50" / "1.234,56" / "12.5" → número.
function parseImporte(v: unknown): number {
  const s = String(v ?? "").trim().replace(/\s|€/g, "");
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

type Err = { code?: string; message?: string } | null;
const tablaFalta = (e: Err) => !!e && (e.code === "42P01" || /relation .*gastos_afiliados/.test(e.message ?? ""));
// Si aún no se ha corrido el SQL de "pagado_por", se sigue funcionando sin él.
const columnaPagoFalta = (e: Err) => !!e && (e.code === "42703" || /pagado_por/.test(e.message ?? ""));

function validar(body: Record<string, unknown>) {
  const fecha = String(body?.fecha ?? "");
  const concepto = String(body?.concepto ?? "").trim().replace(/\s+/g, " ");
  const pagado_por = String(body?.pagado_por ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || null;
  const importe = parseImporte(body?.importe);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < "2024-01-01" || fecha > madridHoy()) return { error: "La fecha no es válida." };
  if (!concepto) return { error: "Escribe en qué os lo habéis gastado." };
  if (concepto.length > 120) return { error: "El concepto es demasiado largo (máximo 120 caracteres)." };
  if (!(importe > 0) || importe > 1_000_000) return { error: "El importe no es válido." };
  return { fila: { fecha, concepto, pagado_por, importe } };
}

export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { desde, hasta, mesVista } = rango(new URL(request.url).searchParams.get("mes"));
  const leer = (cols: string) => {
    let q = supabaseAdmin.from("gastos_afiliados").select(cols).eq("user_id", user.id)
      .order("fecha", { ascending: false }).order("id", { ascending: false }).limit(2000);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    return q;
  };
  let { data: gastos, error } = await leer("id, fecha, pagado_por, concepto, importe");
  if (columnaPagoFalta(error)) ({ data: gastos, error } = await leer("id, fecha, concepto, importe"));
  if (tablaFalta(error)) return NextResponse.json({ gastos: [], ganado: 0, personas: [], equipo: [], mesVista, tablaFalta: true });
  if (error) return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });

  let qs = supabaseAdmin.from("affiliate_daily_stats").select("commission").eq("user_id", user.id).limit(5000);
  if (desde) qs = qs.gte("date", desde);
  if (hasta) qs = qs.lte("date", hasta);
  const [{ data: stats }, { data: nombres }, reparto] = await Promise.all([
    qs,
    supabaseAdmin.from("gastos_afiliados").select("pagado_por").eq("user_id", user.id).not("pagado_por", "is", null).limit(2000),
    leerReparto(user.id),
  ]);
  const ganado = (stats ?? []).reduce((s, r) => s + Number(r.commission ?? 0), 0);
  const personas = [...new Set((nombres ?? []).map((n) => String(n.pagado_por ?? "").trim()).filter(Boolean))].slice(0, 30);

  return NextResponse.json({
    gastos: ((gastos ?? []) as unknown as Record<string, unknown>[]).map((g) => ({ ...g, pagado_por: g.pagado_por ?? null, importe: Number(g.importe) })),
    ganado,
    personas,
    equipo: reparto.miembros,
    mesVista,
  });
}

export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await rateLimitShared(`gastos-afiliado:${user.id}`, 120, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Demasiados gastos seguidos, espera un poco." }, { status: 429 });
  }
  const v = validar(await request.json().catch(() => ({})));
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  let { error } = await supabaseAdmin.from("gastos_afiliados").insert({ user_id: user.id, ...v.fila });
  if (columnaPagoFalta(error)) {
    const { pagado_por: _omit, ...sinPago } = v.fila;
    void _omit;
    ({ error } = await supabaseAdmin.from("gastos_afiliados").insert({ user_id: user.id, ...sinPago }));
  }
  if (tablaFalta(error)) return NextResponse.json({ error: "El apartado de gastos aún no está activado." }, { status: 503 });
  if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Falta el gasto." }, { status: 400 });
  const v = validar(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const actualizar = (fila: Record<string, unknown>) =>
    supabaseAdmin.from("gastos_afiliados").update(fila).eq("id", id).eq("user_id", user.id).select("id");
  let { data, error } = await actualizar(v.fila);
  if (columnaPagoFalta(error)) {
    const { pagado_por: _omit, ...sinPago } = v.fila;
    void _omit;
    ({ data, error } = await actualizar(sinPago));
  }
  if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Falta el gasto." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("gastos_afiliados").delete().eq("id", id).eq("user_id", user.id).select("id");
  if (error) return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// PUT { miembros: [{ nombre, pct }] } → guarda SU reparto de gastos (lista vacía =
// trabaja solo). Ver repartoGastos.ts.
export async function PUT(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const r = await guardarReparto(user.id, body?.miembros);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, miembros: r.miembros });
}
