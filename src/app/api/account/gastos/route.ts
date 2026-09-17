import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { rateLimitShared } from "@/lib/rateLimit";
import { leerConfig, guardarConfig } from "@/lib/repartoGastosServidor";
import { validarReparto, parseImporte } from "@/lib/repartoGastos";

// GASTOS DEL AFILIADO: como el apartado de Gastos del admin, con SU configuración
// (socios y conceptos con el % de cada uno, ver repartoGastos.ts).
//  - GET ?mes=YYYY-MM | ?mes=todo → sus gastos del periodo y su configuración
//    (null = aún no la ha hecho). Es solo para hacer cuentas entre socios: no se
//    resta de lo que gana.
//  - POST { fecha, pagado_por, concepto, importe, reparto } → añade. `reparto` son
//    los % de cada socio EN ESE GASTO (salen del concepto y se pueden cambiar).
//  - PATCH { id, fecha, pagado_por, concepto, importe, reparto } → edita uno SUYO.
//  - DELETE ?id= → borra uno SUYO.
//  - PUT { config } → guarda su configuración.
// Cada afiliado solo ve y toca lo suyo: el filtro por su user_id va en servidor.

const madridHoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

function rango(param: string | null): { desde: string | null; hasta: string | null; mesVista: string | null } {
  if (param === "todo") return { desde: null, hasta: null, mesVista: null };
  const hoy = madridHoy();
  const mes = param && /^\d{4}-\d{2}$/.test(param) ? param : hoy.slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { desde: `${mes}-01`, hasta: mes === hoy.slice(0, 7) ? hoy : ultimo, mesVista: mes };
}


type Err = { code?: string; message?: string } | null;
const tablaFalta = (e: Err) => !!e && (e.code === "42P01" || /relation .*gastos_afiliados/.test(e.message ?? ""));
// Si aún no se ha corrido el SQL de una columna nueva (pagado_por, reparto), se
// sigue funcionando sin ella.
const columnaFalta = (e: Err, col: string) => !!e && new RegExp(col).test(e.message ?? "");
const sin = (fila: Record<string, unknown>, col: string) => {
  const f = { ...fila };
  delete f[col];
  return f;
};

function validar(body: Record<string, unknown>) {
  const fecha = String(body?.fecha ?? "");
  const concepto = String(body?.concepto ?? "").trim().replace(/\s+/g, " ");
  const pagado_por = String(body?.pagado_por ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || null;
  const importe = parseImporte(body?.importe);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < "2024-01-01" || fecha > madridHoy()) return { error: "La fecha no es válida." };
  if (!concepto) return { error: "Elige el concepto." };
  if (concepto.length > 120) return { error: "El concepto es demasiado largo (máximo 120 caracteres)." };
  if (!(importe > 0) || importe > 1_000_000) return { error: "El importe no es válido." };
  const r = validarReparto(body?.reparto);
  if ("error" in r) return { error: r.error };
  return { fila: { fecha, concepto, pagado_por, importe, reparto: r.reparto } as Record<string, unknown> };
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
  let { data: gastos, error } = await leer("id, fecha, pagado_por, concepto, importe, reparto");
  if (columnaFalta(error, "reparto")) ({ data: gastos, error } = await leer("id, fecha, pagado_por, concepto, importe"));
  if (columnaFalta(error, "pagado_por")) ({ data: gastos, error } = await leer("id, fecha, concepto, importe"));
  if (tablaFalta(error)) return NextResponse.json({ gastos: [], config: null, mesVista, tablaFalta: true });
  if (error) return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });

  const cfg = await leerConfig(user.id);
  // Sin esto, un fallo al leer la configuración le enseñaría la pantalla de
  // "configura tus gastos" como si nunca la hubiera hecho.
  if (cfg.error) return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });

  return NextResponse.json({
    gastos: ((gastos ?? []) as unknown as Record<string, unknown>[]).map((g) => ({ ...g, pagado_por: g.pagado_por ?? null, reparto: Array.isArray(g.reparto) ? g.reparto : null, importe: Number(g.importe) })),
    config: cfg.config,
    tablaFalta: cfg.tablaFalta,
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
  const insertar = (fila: Record<string, unknown>) => supabaseAdmin.from("gastos_afiliados").insert({ user_id: user.id, ...fila });
  let fila = v.fila;
  let { error } = await insertar(fila);
  if (columnaFalta(error, "reparto")) ({ error } = await insertar((fila = sin(fila, "reparto"))));
  if (columnaFalta(error, "pagado_por")) ({ error } = await insertar(sin(fila, "pagado_por")));
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
  let fila = v.fila;
  let { data, error } = await actualizar(fila);
  if (columnaFalta(error, "reparto")) ({ data, error } = await actualizar((fila = sin(fila, "reparto"))));
  if (columnaFalta(error, "pagado_por")) ({ data, error } = await actualizar(sin(fila, "pagado_por")));
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

export async function PUT(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await rateLimitShared(`gastos-config:${user.id}`, 60, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Demasiados cambios seguidos, espera un poco." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const r = await guardarConfig(user.id, body?.config);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, config: r.config });
}
