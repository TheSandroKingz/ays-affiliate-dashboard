import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Apartado de GASTOS del negocio (publicidad, Claude, etc.). Solo admin.
//  - GET  ?mes=YYYY-MM | ?mes=historico | (vacío = mes en curso): lista + totales.
//  - POST { fecha, categoria, quien, concepto, importe }: añade un gasto.
//  - DELETE ?id=123: borra un gasto.

const CATEGORIAS = new Set(["publicidad", "claude_prog", "claude_bots", "otros"]);
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

  return NextResponse.json({
    etiqueta,
    gastos,
    total,
    porQuien: {
      kingz: suma((g) => g.quien === "kingz"),
      prz: suma((g) => g.quien === "prz"),
      comun: suma((g) => g.quien === "comun"),
    },
    porCategoria: {
      publicidad: suma((g) => g.categoria === "publicidad"),
      claude_prog: suma((g) => g.categoria === "claude_prog"),
      claude_bots: suma((g) => g.categoria === "claude_bots"),
      otros: suma((g) => g.categoria === "otros"),
    },
  });
}

export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

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
