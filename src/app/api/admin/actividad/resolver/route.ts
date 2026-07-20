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

  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("cpa_spain, cpa_other")
    .eq("user_id", ev.matched_user_id)
    .maybeSingle();
  const commission = Number(
    (ev.isocountry === "ES" ? aff?.cpa_spain : aff?.cpa_other) ?? 0
  );

  // RECLAMO ATÓMICO: marcamos "counted" solo si SIGUE en "held". Este UPDATE es
  // atómico en Postgres, así que si se pulsa dos veces (o hay dos pestañas),
  // solo UNA gana y solo se suma UNA vez. Si no gana ninguna fila, ya se resolvió.
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("postback_events")
    .update({ status: "counted", counted: true, commission })
    .eq("id", id)
    .eq("status", "held")
    .select("id");
  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: "Ese evento ya está resuelto." },
      { status: 409 }
    );
  }

  // Candado por player_id (protección adicional frente a reenvíos futuros).
  const eventKey = ev.player_id ? `ftd:${ev.player_id}` : null;
  await reclamarEvento(eventKey);

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
    // El incremento falló: revertimos a "held" para poder reintentar (no se
    // queda como contado sin haber sumado).
    await supabaseAdmin
      .from("postback_events")
      .update({ status: "held", counted: false, commission: 0 })
      .eq("id", id)
      .then(() => {}, () => {});
    return NextResponse.json({ error: incErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, accion, commission });
}
