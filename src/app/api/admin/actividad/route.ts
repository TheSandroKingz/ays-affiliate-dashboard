import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Actividad de postbacks (solo admin): los últimos eventos que manda freshbet
// (registro/FTD/comisión) desde la "caja negra" postback_events, con el nombre
// del afiliado y un aviso si hay FTD contados SIN player_id (sin anti-duplicado).
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: events, error } = await supabaseAdmin
    .from("postback_events")
    .select(
      "id, created_at, event_type, status, counted, commission, player_id, tracking_code, afp, isocountry, matched_user_id"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  // Si la tabla aún no existe, devolvemos vacío (no rompe el panel).
  if (error) {
    return NextResponse.json({ events: [], sinPlayerId: 0, tablaFalta: true });
  }

  const ids = [
    ...new Set(
      (events ?? []).map((e) => e.matched_user_id).filter(Boolean) as string[]
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

  // Resumen de anomalías (de los últimos 100 eventos).
  const sinPlayerId = rows.filter(
    (r) => r.event_type === "ftd" && r.counted && !r.player_id
  ).length;
  const duplicados = rows.filter((r) => r.status === "duplicate").length;
  const noMatch = rows.filter((r) => r.status === "no_match").length;

  // Jugadores CONTADOS más de una vez = doble pago real (no debería pasar con
  // el candado; si aparece, hay que revisarlo ya).
  const cnt = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type === "ftd" && r.counted && r.player_id) {
      cnt.set(r.player_id, (cnt.get(r.player_id) ?? 0) + 1);
    }
  }
  const repetidos = [...cnt.entries()]
    .filter(([, n]) => n > 1)
    .map(([player_id, veces]) => ({ player_id, veces }));

  return NextResponse.json({
    events: rows,
    sinPlayerId,
    resumen: { sinPlayerId, duplicados, noMatch, repetidos },
  });
}
