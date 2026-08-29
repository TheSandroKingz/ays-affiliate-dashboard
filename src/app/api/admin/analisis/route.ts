import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getGestorBot } from "@/lib/adminAuth";
import { analizarLote, generarInforme } from "@/lib/analisisHistorial";

// Clasificar conversaciones tarda (llama a la API de Claude), damos margen.
export const maxDuration = 60;

// GET: último informe + config (para la sección del dashboard). Admin/Yaiza.
// POST ?run=lote  → clasifica un lote de conversaciones (para probar/adelantar backlog).
// POST ?run=informe → genera el informe agregado del periodo.
// (En producción el cron diario los llama solos; el POST es para probar a mano.)

export async function GET(request: Request) {
  // LEER el informe: admin y gestores del bot (Yaiza). Es solo lectura.
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data: informe } = await supabaseAdmin
    .from("analisis_informes")
    .select("id, desde, hasta, datos, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: config } = await supabaseAdmin
    .from("analisis_config")
    .select("umbral, ultimo_run, ultimo_informe")
    .eq("id", 1)
    .maybeSingle();
  const { count } = await supabaseAdmin
    .from("analisis_conversaciones")
    .select("id", { count: "exact", head: true });
  return NextResponse.json({ informe: informe ?? null, config: config ?? null, clasificadas_total: count ?? 0 });
}

export async function POST(request: Request) {
  // Disparar el análisis a mano: admin y gestores del bot (Yaiza). Solo clasifica
  // conversaciones y genera el informe (no toca dinero ni el bot).
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const run = new URL(request.url).searchParams.get("run");
  if (run === "informe") {
    const r = await generarInforme();
    return NextResponse.json({ ok: !!r, informe_id: r?.id ?? null });
  }
  // Por defecto: clasificar un lote.
  const n = await analizarLote(12);
  return NextResponse.json({ ok: true, clasificadas: n });
}
