import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Apartado de GASTOS del negocio (publicidad, Claude, etc.). Solo admin.
//  - GET  ?mes=YYYY-MM | ?mes=historico | (vacío = mes en curso): lista + totales.
//  - POST { fecha, categoria, quien, concepto, importe }: añade un gasto.
//  - POST { accion:"copiar_mes", mes:"YYYY-MM" }: copia los gastos del mes ANTERIOR
//         a ese mes (útil para gastos fijos que se repiten, como Claude).
//  - PATCH { id, ...campos }: edita un gasto.
//  - DELETE ?id=123: borra un gasto.

const CATEGORIAS = new Set([
  "publicidad", "claude_prog", "claude_bots", "restaurantes", "taxis", "prestamo", "otros",
]);
const QUIENES = new Set(["kingz", "prz", "comun"]);

const hoyMadrid = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const hoy = hoyMadrid();
  const mesActual = hoy.slice(0, 7);
  const param = new URL(request.url).searchParams.get("mes") || "";

  let desde: string;
  let hasta: string;
  let etiqueta: string;
  if (param === "historico") {
    desde = "2000-01-01";
    hasta = hoy;
    etiqueta = "Histórico (todo)";
  } else if (/^\d{4}$/.test(param)) {
    // Año completo (p. ej. 2026): del 1-ene al 31-dic (o hasta hoy si es el actual).
    desde = `${param}-01-01`;
    hasta = param === hoy.slice(0, 4) ? hoy : `${param}-12-31`;
    etiqueta = param;
  } else if (/^\d{4}-\d{2}$/.test(param)) {
    const [yy, mm] = param.split("-").map(Number);
    desde = `${param}-01`;
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

  const { data, error } = await supabaseAdmin
    .from("gastos")
    .select("id, fecha, categoria, quien, concepto, importe")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(100000);

  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });

  const gastos = (data ?? []).map((g) => ({
    id: g.id,
    fecha: String(g.fecha).slice(0, 10),
    categoria: g.categoria,
    quien: g.quien,
    concepto: g.concepto ?? "",
    importe: Number(g.importe ?? 0),
  }));

  const total = gastos.reduce((s, g) => s + g.importe, 0);
  const suma = (pred: (g: (typeof gastos)[number]) => boolean) =>
    gastos.filter(pred).reduce((s, g) => s + g.importe, 0);

  // Total del mes anterior (para la comparativa), solo cuando miramos un mes.
  let totalAnterior: number | null = null;
  const mesVista = etiqueta === mesActual ? mesActual : param;
  if (/^\d{4}-\d{2}$/.test(mesVista)) {
    const prev = mesAnterior(mesVista);
    const [py, pm] = prev.split("-").map(Number);
    const { data: ant } = await supabaseAdmin
      .from("gastos")
      .select("importe")
      .gte("fecha", `${prev}-01`)
      .lte("fecha", new Date(Date.UTC(py, pm, 0)).toISOString().slice(0, 10))
      .limit(100000);
    totalAnterior = (ant ?? []).reduce((s, r) => s + Number(r.importe ?? 0), 0);
  }

  // ¿Está saldado este mes? (solo en vista de un mes concreto)
  let saldado: { mes: string; saldado_at: string; detalle: string | null } | null = null;
  if (/^\d{4}-\d{2}$/.test(mesVista)) {
    const { data: s } = await supabaseAdmin
      .from("gastos_saldos")
      .select("mes, saldado_at, detalle")
      .eq("mes", mesVista)
      .maybeSingle();
    saldado = s ?? null;
  }

  return NextResponse.json({
    etiqueta,
    mesVista: /^\d{4}-\d{2}$/.test(mesVista) ? mesVista : null,
    gastos,
    total,
    totalAnterior,
    saldado,
    porQuien: {
      kingz: suma((g) => g.quien === "kingz"),
      prz: suma((g) => g.quien === "prz"),
      comun: suma((g) => g.quien === "comun"),
    },
    porCategoria: {
      publicidad: suma((g) => g.categoria === "publicidad"),
      claude_prog: suma((g) => g.categoria === "claude_prog"),
      claude_bots: suma((g) => g.categoria === "claude_bots"),
      restaurantes: suma((g) => g.categoria === "restaurantes"),
      taxis: suma((g) => g.categoria === "taxis"),
      prestamo: suma((g) => g.categoria === "prestamo"),
      otros: suma((g) => g.categoria === "otros"),
    },
  });
}

// Mes anterior a un "YYYY-MM" dado.
function mesAnterior(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  // ── Marcar un mes como saldado / reabrirlo ─────────────────────────────────
  if (body.accion === "saldar" || body.accion === "reabrir") {
    const mesActual = hoyMadrid().slice(0, 7);
    const mes = /^\d{4}-\d{2}$/.test(body.mes) ? body.mes : mesActual;
    if (body.accion === "reabrir") {
      await supabaseAdmin.from("gastos_saldos").delete().eq("mes", mes);
      return NextResponse.json({ ok: true, saldado: null });
    }
    const detalle = String(body.detalle ?? "").slice(0, 200) || null;
    const { data, error } = await supabaseAdmin
      .from("gastos_saldos")
      .upsert({ mes, detalle }, { onConflict: "mes" })
      .select("mes, saldado_at, detalle")
      .single();
    if (error) return NextResponse.json({ error: "No se pudo saldar" }, { status: 500 });
    return NextResponse.json({ ok: true, saldado: data });
  }

  // ── Copiar los gastos del mes anterior al mes indicado ──────────────────────
  if (body.accion === "copiar_mes") {
    const mesActual = hoyMadrid().slice(0, 7);
    const mes = /^\d{4}-\d{2}$/.test(body.mes) ? body.mes : mesActual;
    const prev = mesAnterior(mes);
    const [py, pm] = prev.split("-").map(Number);
    const prevDesde = `${prev}-01`;
    const prevHasta = new Date(Date.UTC(py, pm, 0)).toISOString().slice(0, 10);
    const [ty, tm] = mes.split("-").map(Number);
    const mesDesde = `${mes}-01`;
    const mesHasta = new Date(Date.UTC(ty, tm, 0)).toISOString().slice(0, 10);

    const { data: origen } = await supabaseAdmin
      .from("gastos")
      .select("fecha, categoria, quien, concepto, importe")
      .gte("fecha", prevDesde)
      .lte("fecha", prevHasta)
      .limit(100000);
    if (!origen || origen.length === 0)
      return NextResponse.json({ ok: true, copiados: 0 });

    // Dedupe: no dupliques lo que ya esté en el mes destino (misma categoría,
    // persona, concepto e importe).
    const { data: yaHay } = await supabaseAdmin
      .from("gastos")
      .select("categoria, quien, concepto, importe")
      .gte("fecha", mesDesde)
      .lte("fecha", mesHasta)
      .limit(100000);
    const clave = (g: { categoria: string; quien: string; concepto: string | null; importe: number }) =>
      `${g.categoria}|${g.quien}|${(g.concepto ?? "").trim()}|${Number(g.importe)}`;
    const existentes = new Set((yaHay ?? []).map(clave));

    const nuevos = origen
      .filter((g) => !existentes.has(clave(g)))
      .map((g) => ({
        fecha: `${mes}-01`,
        categoria: g.categoria,
        quien: g.quien,
        concepto: g.concepto,
        importe: g.importe,
      }));
    if (nuevos.length === 0) return NextResponse.json({ ok: true, copiados: 0 });

    const { error } = await supabaseAdmin.from("gastos").insert(nuevos);
    if (error) return NextResponse.json({ error: "No se pudo copiar" }, { status: 500 });
    return NextResponse.json({ ok: true, copiados: nuevos.length });
  }

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : hoyMadrid();
  const categoria = String(body.categoria ?? "");
  const quien = String(body.quien ?? "comun");
  const concepto = String(body.concepto ?? "").trim().slice(0, 200) || null;
  const importe = Number(body.importe);

  if (!CATEGORIAS.has(categoria))
    return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
  if (!QUIENES.has(quien))
    return NextResponse.json({ error: "Persona inválida" }, { status: 400 });
  if (!Number.isFinite(importe) || importe <= 0)
    return NextResponse.json({ error: "Importe inválido" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("gastos")
    .insert({ fecha, categoria, quien, concepto, importe: Math.round(importe * 100) / 100 })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!body || !Number.isFinite(id) || id <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const campos: Record<string, unknown> = {};
  if (typeof body.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha))
    campos.fecha = body.fecha;
  if (typeof body.categoria === "string") {
    if (!CATEGORIAS.has(body.categoria))
      return NextResponse.json({ error: "Categoría inválida" }, { status: 400 });
    campos.categoria = body.categoria;
  }
  if (typeof body.quien === "string") {
    if (!QUIENES.has(body.quien))
      return NextResponse.json({ error: "Persona inválida" }, { status: 400 });
    campos.quien = body.quien;
  }
  if (body.concepto !== undefined)
    campos.concepto = String(body.concepto ?? "").trim().slice(0, 200) || null;
  if (body.importe !== undefined) {
    const importe = Number(body.importe);
    if (!Number.isFinite(importe) || importe <= 0)
      return NextResponse.json({ error: "Importe inválido" }, { status: 400 });
    campos.importe = Math.round(importe * 100) / 100;
  }
  if (Object.keys(campos).length === 0)
    return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });

  const { error } = await supabaseAdmin.from("gastos").update(campos).eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0)
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const { error } = await supabaseAdmin.from("gastos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
