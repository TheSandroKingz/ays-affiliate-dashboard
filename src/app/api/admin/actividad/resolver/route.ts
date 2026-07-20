import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { reclamarEvento } from "@/lib/postback";

// Resolver un FTD RETENIDO (solo admin). Un retenido es un FTD que NO se contó
// por sospecha de doble pago. El admin decide:
//   - "descartar" : confirmar que es un duplicado → queda descartado (no suma)
//   - "contar"    : es legítimo → se suma el CPA al afiliado (una sola vez)
// Es idempotente: solo actúa si el evento sigue en estado "held".
export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  const accion = body.accion;
  if (!id || (accion !== "contar" && accion !== "descartar")) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { data: ev, error: evErr } = await supabaseAdmin
    .from("postback_events")
    .select("id, status, player_id, isocountry, matched_user_id, event_type")
    .eq("id", id)
    .maybeSingle();
  if (evErr) {
    return NextResponse.json({ error: evErr.message }, { status: 500 });
  }
  if (!ev) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (ev.status !== "held") {
    return NextResponse.json(
      { error: "Ese evento ya está resuelto." },
      { status: 409 }
    );
  }

  // Descartar: confirmar que era un duplicado. No se suma nada.
  if (accion === "descartar") {
    const { error } = await supabaseAdmin
      .from("postback_events")
      .update({ status: "discarded" })
      .eq("id", id)
      .eq("status", "held");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, accion });
  }

  // Contar: es legítimo. Sumamos el CPA al afiliado (una sola vez).
  if (!ev.matched_user_id) {
    return NextResponse.json(
      { error: "Este evento no está atribuido a ningún afiliado." },
      { status: 400 }
    );
  }

  // Candado: reclamamos el evento para que nunca pueda contarse dos veces.
  const eventKey = ev.player_id ? `ftd:${ev.player_id}` : null;
  await reclamarEvento(eventKey);

  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("cpa_spain, cpa_other")
    .eq("user_id", ev.matched_user_id)
    .maybeSingle();
  const commission = Number(
    (ev.isocountry === "ES" ? aff?.cpa_spain : aff?.cpa_other) ?? 0
  );

  // Se cuenta en la fecha de hoy (cuando lo apruebas), zona Madrid.
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  const { error: incErr } = await supabaseAdmin.rpc("increment_daily_stats", {
    p_user_id: ev.matched_user_id,
    p_date: fecha,
    p_registrations: 0,
    p_ftd: 1,
    p_commission: commission,
  });
  if (incErr) {
    return NextResponse.json({ error: incErr.message }, { status: 500 });
  }

  const { error: updErr } = await supabaseAdmin
    .from("postback_events")
    .update({ status: "counted", counted: true, commission })
    .eq("id", id)
    .eq("status", "held");
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, accion, commission });
}
