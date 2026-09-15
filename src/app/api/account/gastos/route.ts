import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { rateLimitShared } from "@/lib/rateLimit";

// GASTOS DEL AFILIADO: lo que apunta que se gasta (publicidad, etc.) para ver lo
// que le queda limpio. Como el apartado de Gastos del admin, pero sin categorías
// ni reparto: el concepto lo escribe él y el gasto es solo suyo.
//  - GET ?mes=YYYY-MM | ?mes=todo  → sus gastos del periodo + lo ganado en él.
//  - POST { fecha, concepto, importe } → añade un gasto.
//  - DELETE ?id= → borra uno SUYO.
// Cada afiliado solo ve y toca los suyos (filtro por su user_id en el servidor).

const madridHoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

function rango(param: string | null): { desde: string | null; hasta: string | null } {
  if (param === "todo") return { desde: null, hasta: null };
  const hoy = madridHoy();
  const mes = param && /^\d{4}-\d{2}$/.test(param) ? param : hoy.slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { desde: `${mes}-01`, hasta: mes === hoy.slice(0, 7) ? hoy : ultimo };
}

// "12,50" / "1.234,56" / "12.5" → número.
function parseImporte(v: unknown): number {
  const s = String(v ?? "").trim().replace(/\s|€/g, "");
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

const tablaFalta = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /gastos_afiliados/.test(e.message ?? ""));

export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { desde, hasta } = rango(new URL(request.url).searchParams.get("mes"));
  let qg = supabaseAdmin
    .from("gastos_afiliados")
    .select("id, fecha, concepto, importe")
    .eq("user_id", user.id)
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(2000);
  let qs = supabaseAdmin.from("affiliate_daily_stats").select("commission").eq("user_id", user.id).limit(5000);
  if (desde) { qg = qg.gte("fecha", desde); qs = qs.gte("date", desde); }
  if (hasta) { qg = qg.lte("fecha", hasta); qs = qs.lte("date", hasta); }

  const [{ data: gastos, error: eg }, { data: stats }] = await Promise.all([qg, qs]);
  if (tablaFalta(eg)) return NextResponse.json({ gastos: [], ganado: 0, tablaFalta: true });
  if (eg) return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });

  const ganado = (stats ?? []).reduce((s, r) => s + Number(r.commission ?? 0), 0);
  return NextResponse.json({
    gastos: (gastos ?? []).map((g) => ({ ...g, importe: Number(g.importe) })),
    ganado,
  });
}

export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await rateLimitShared(`gastos-afiliado:${user.id}`, 120, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Demasiados gastos seguidos, espera un poco." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const fecha = String(body?.fecha ?? "");
  const concepto = String(body?.concepto ?? "").trim().replace(/\s+/g, " ");
  const importe = parseImporte(body?.importe);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < "2024-01-01" || fecha > madridHoy()) {
    return NextResponse.json({ error: "La fecha no es válida." }, { status: 400 });
  }
  if (!concepto) return NextResponse.json({ error: "Escribe en qué te lo has gastado." }, { status: 400 });
  if (concepto.length > 120) return NextResponse.json({ error: "El concepto es demasiado largo (máximo 120 caracteres)." }, { status: 400 });
  if (!(importe > 0) || importe > 1_000_000) {
    return NextResponse.json({ error: "El importe no es válido." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("gastos_afiliados")
    .insert({ user_id: user.id, fecha, concepto, importe })
    .select("id, fecha, concepto, importe")
    .maybeSingle();
  if (tablaFalta(error)) return NextResponse.json({ error: "El apartado de gastos aún no está activado." }, { status: 503 });
  if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  return NextResponse.json({ ok: true, gasto: data });
}

export async function DELETE(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Falta el gasto." }, { status: 400 });
  // Solo borra si es SUYO: el filtro por user_id va en la propia consulta.
  const { data, error } = await supabaseAdmin
    .from("gastos_afiliados")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
