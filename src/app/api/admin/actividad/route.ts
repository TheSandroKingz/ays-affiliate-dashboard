import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser, ADMIN_USER_ID } from "@/lib/adminAuth";
import { deteccionFraude } from "@/lib/seguridad";

// Actividad de postbacks (solo admin): los últimos eventos que manda freshbet
// (registro/FTD/comisión) desde la "caja negra" postback_events, con el nombre
// del afiliado y un aviso si hay FTD contados SIN player_id (sin anti-duplicado).
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const columnas =
    "id, created_at, event_type, status, counted, commission, player_id, tracking_code, afp, isocountry, matched_user_id";

  // Modo LIGERO (campana de notificaciones): solo los eventos recientes con nombre.
  // Se salta la consulta de RETENIDOS (limit 100000) y deteccionFraude() (3 querys
  // pesadas) porque la campana solo usa `events`. Mucho más barato en cada carga.
  const url = new URL(request.url);
  if (url.searchParams.get("ligero")) {
    const { data: ev } = await supabaseAdmin
      .from("postback_events")
      .select(columnas)
      .order("created_at", { ascending: false })
      .limit(80);
    const uids = [
      ...new Set((ev ?? []).map((e) => e.matched_user_id).filter(Boolean) as string[]),
    ];
    const nm = new Map<string, string | null>();
    if (uids.length) {
      const { data: affs } = await supabaseAdmin
        .from("affiliates")
        .select("user_id, display_name")
        .in("user_id", uids);
      for (const a of affs ?? []) nm.set(a.user_id, a.display_name);
    }
    const evs = (ev ?? [])
      .filter((e) => e.matched_user_id && e.matched_user_id !== ADMIN_USER_ID)
      .map((e) => ({
        ...e,
        name: e.matched_user_id ? nm.get(e.matched_user_id) ?? null : null,
      }));
    return NextResponse.json({ events: evs });
  }

  const [{ data: events, error }, { data: heldRaw }, fraude] = await Promise.all([
    supabaseAdmin
      .from("postback_events")
      .select(columnas)
      .order("created_at", { ascending: false })
      .limit(300),
    // Los RETENIDOS van en consulta APARTE, sin el tope de los 300 últimos: si no,
    // un retenido más viejo que esos 300 desaparecía del panel y no se podía ni
    // contar ni descartar (quedaba en el limbo).
    supabaseAdmin
      .from("postback_events")
      .select(columnas)
      .eq("status", "held")
      .order("created_at", { ascending: false })
      .limit(100000),
    deteccionFraude(),
  ]);

  // Si la tabla aún no existe, devolvemos vacío (no rompe el panel).
  if (error) {
    return NextResponse.json({ events: [], sinPlayerId: 0, tablaFalta: true });
  }

  const ids = [
    ...new Set(
      [...(events ?? []), ...(heldRaw ?? [])]
        .map((e) => e.matched_user_id)
        .filter(Boolean) as string[]
    ),
  ];
  const names = new Map<string, string | null>();
  if (ids.length) {
    const { data: affs } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, display_name")
      .in("user_id", ids);
    for (const a of affs ?? []) names.set(a.user_id, a.display_name);
  }

  const rows = (events ?? []).map((e) => ({
    ...e,
    name: e.matched_user_id ? names.get(e.matched_user_id) ?? null : null,
  }));

  // FTD RETENIDOS: frenados por sospecha de doble pago, esperando que decidas
  // (contar o descartar). Van aparte, arriba del todo, para que no se pasen.
  // Vienen de su consulta propia (sin tope de 300) → nunca se pierden.
  const retenidos = (heldRaw ?? []).map((e) => ({
    ...e,
    name: e.matched_user_id ? names.get(e.matched_user_id) ?? null : null,
  }));

  // Un QFTD/FTD contado va como counted; los QFTD son event_type "commission".
  const esFtdOQftd = (t: string) => t === "ftd" || t === "commission";
  // Resumen de anomalías (de los últimos 300 eventos).
  const sinPlayerId = rows.filter(
    (r) => esFtdOQftd(r.event_type) && r.counted && !r.player_id
  ).length;
  const duplicados = rows.filter((r) => r.status === "duplicate").length;
  const noMatch = rows.filter((r) => r.status === "no_match").length;

  // Jugadores CONTADOS más de una vez = doble pago real (no debería pasar con
  // el candado; si aparece, hay que revisarlo ya).
  const cnt = new Map<string, number>();
  for (const r of rows) {
    // Solo los contados AUTOMÁTICAMENTE (status "counted"); los aprobados a mano
    // quedan "resolved" y no cuentan como doble. Exigimos counted=true porque una
    // reversión pone counted=false pero deja status="counted" (si no, daba doble falso).
    if (esFtdOQftd(r.event_type) && r.status === "counted" && r.counted && r.player_id) {
      cnt.set(r.player_id, (cnt.get(r.player_id) ?? 0) + 1);
    }
  }
  const repetidos = [...cnt.entries()]
    .filter(([, n]) => n > 1)
    .map(([player_id, veces]) => ({ player_id, veces }));

  // En la tabla mostramos SOLO la actividad de tus afiliados: fuera lo tuyo
  // (afp del admin) y lo "Default"/sin emparejar (pings de freshbet). Las
  // anomalías (resumen) sí se cuentan sobre todo.
  const eventosAfiliados = rows.filter(
    (r) => r.matched_user_id && r.matched_user_id !== ADMIN_USER_ID
  );

  // Fecha del último evento recibido de FreshBet (de TODOS, no solo afiliados):
  // sirve para ver de un vistazo si FreshBet sigue enviando.
  const ultimoEvento = rows[0]?.created_at ?? null;

  return NextResponse.json({
    events: eventosAfiliados,
    retenidos,
    ultimoEvento,
    sinPlayerId,
    resumen: {
      sinPlayerId,
      duplicados,
      noMatch,
      repetidos,
      retenidos: retenidos.length,
    },
    fraude,
  });
}
