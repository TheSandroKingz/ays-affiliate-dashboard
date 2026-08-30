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

  // Enriquecer los ejemplos del informe con su chat_id para poder ABRIR el chat
  // desde cada caso — también en informes VIEJOS que no lo guardaron. Cruzamos por
  // (bot + resumen) contra las conversaciones clasificadas del mismo periodo.
  await enriquecerConChatId(informe as InformeRow);

  return NextResponse.json({ informe: informe ?? null, config: config ?? null, clasificadas_total: count ?? 0 });
}

type Ejemplo = {
  bot?: string;
  chat_id?: number | null;
  tipo?: string;
  resumen?: string;
  revisado?: boolean;
};
type InformeRow = {
  desde: string;
  hasta: string;
  datos?: {
    ejemplos_no_resueltos?: Ejemplo[];
    ejemplos_friccion?: Ejemplo[];
    ejemplos_decepcion?: Ejemplo[];
    ejemplos_bienestar?: Ejemplo[];
  } | null;
} | null;

async function enriquecerConChatId(informe: InformeRow) {
  if (!informe?.datos) return;
  const ejemplos = [
    ...(informe.datos.ejemplos_no_resueltos ?? []),
    ...(informe.datos.ejemplos_friccion ?? []),
    ...(informe.datos.ejemplos_decepcion ?? []),
    ...(informe.datos.ejemplos_bienestar ?? []),
  ];
  if (!ejemplos.length) return;
  // Conversaciones clasificadas del periodo: para completar chat_id (informes viejos)
  // y traer el estado 'revisado' (marca de Yaiza) de cada caso.
  const { data: convs } = await supabaseAdmin
    .from("analisis_conversaciones")
    .select("bot, chat_id, resumen, revisado")
    .gte("created_at", informe.desde)
    .lte("created_at", informe.hasta)
    .limit(100000);
  const mapa = new Map<string, { chat_id: number; revisado: boolean }>();
  for (const c of (convs ?? []) as {
    bot: string;
    chat_id: number;
    resumen: string | null;
    revisado: boolean;
  }[]) {
    if (c.resumen) mapa.set(`${c.bot}|${c.resumen}`, { chat_id: c.chat_id, revisado: !!c.revisado });
    // También por chat_id directo (para casos que ya traen chat_id).
    mapa.set(`${c.bot}#${c.chat_id}`, { chat_id: c.chat_id, revisado: !!c.revisado });
  }
  for (const e of ejemplos) {
    if (!e) continue;
    const hit =
      (e.chat_id != null ? mapa.get(`${e.bot}#${e.chat_id}`) : undefined) ??
      (e.resumen ? mapa.get(`${e.bot}|${e.resumen}`) : undefined);
    if (hit) {
      if (e.chat_id == null) e.chat_id = hit.chat_id;
      e.revisado = hit.revisado;
    }
  }
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
  // Marcar/desmarcar un caso como REVISADO por Yaiza (por bot + chat_id).
  if (run === "revisar") {
    let body: { bot?: string; chat_id?: number; revisado?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    if (!body.bot || body.chat_id == null) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from("analisis_conversaciones")
      .update({ revisado: body.revisado !== false })
      .eq("bot", body.bot)
      .eq("chat_id", Number(body.chat_id));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, revisado: body.revisado !== false });
  }
  // Por defecto: clasificar un lote.
  const n = await analizarLote(12);
  return NextResponse.json({ ok: true, clasificadas: n });
}
