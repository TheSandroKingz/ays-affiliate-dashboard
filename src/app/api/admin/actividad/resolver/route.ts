import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { reclamarEvento, liberarEvento, ftdYaContado } from "@/lib/postback";

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
  // País desconocido → tarifa España por defecto (casino español).
  const esOtroPais = ev.isocountry && ev.isocountry !== "ES";
  const commission = Number(
    (esOtroPais ? aff?.cpa_other : aff?.cpa_spain) ?? 0
  );

  // ── ANTI-DOBLE-PAGO (por jugador, no solo por evento) ────────────────────
  // El reclamo atómico de más abajo solo evita contar DOS VECES el MISMO evento.
  // Pero pueden existir VARIOS retenidos del mismo jugador (FreshBet reenvía);
  // aprobar dos pagaría dos veces. Antes de sumar comprobamos, por player_id:
  //   (1) ftdYaContado: ¿ese jugador ya tiene algún evento contado (automático
  //       o de otra aprobación)? → NO sumar.
  //   (2) Candado atómico por jugador (MISMA clave que el flujo automático,
  //       qftd:<player>) para ganar cualquier carrera entre dos aprobaciones.
  // Si cualquiera falla, descartamos este retenido sin sumar.
  if (ev.player_id) {
    const yaContado = await ftdYaContado(ev.player_id);
    const gotLock = yaContado ? false : await reclamarEvento(`qftd:${ev.player_id}`);
    if (!gotLock) {
      await supabaseAdmin
        .from("postback_events")
        .update({ status: "discarded" })
        .eq("id", id)
        .eq("status", "held");
      return NextResponse.json(
        {
          error:
            "Este jugador ya estaba contado. No se ha vuelto a sumar (evitado un doble pago).",
        },
        { status: 409 }
      );
    }
  }

  // RECLAMO ATÓMICO: marcamos "counted" solo si SIGUE en "held". Este UPDATE es
  // atómico en Postgres, así que si se pulsa dos veces (o hay dos pestañas),
  // solo UNA gana y solo se suma UNA vez. Si no gana ninguna fila, ya se resolvió.
  // Estado "resolved" (no "counted") para distinguir un FTD que TÚ aprobaste
  // manualmente de un conteo automático. Así el detector de "doble pago" no lo
  // confunde con una duplicación real (el dinero sí se suma: counted = true).
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("postback_events")
    .update({ status: "resolved", counted: true, commission })
    .eq("id", id)
    .eq("status", "held")
    .select("id");
  if (claimErr || !claimed || claimed.length === 0) {
    // No ganamos el evento (ya resuelto / error): soltamos el candado de jugador
    // que acabamos de reclamar para no dejarlo bloqueado.
    if (ev.player_id) await liberarEvento(`qftd:${ev.player_id}`);
    if (claimErr) {
      return NextResponse.json({ error: claimErr.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Ese evento ya está resuelto." },
      { status: 409 }
    );
  }

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
    // IMPORTANTE: NO revertimos a "held". El RPC pudo haber confirmado el
    // incremento aunque devolviera error (timeout / respuesta perdida). Si lo
    // revirtiéramos, un segundo "Contar" volvería a sumar el dinero DOS VECES.
    // Lo dejamos como "counted" (el candado atómico ya impide reintentos): en
    // el peor caso queda un FTD sin sumar (nunca un doble pago). Se avisa para
    // revisarlo a mano.
    return NextResponse.json(
      {
        error:
          "Marcado como contado, pero el incremento devolvió error. Revisa el balance del afiliado antes de nada (no vuelvas a pulsar Contar).",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, accion, commission });
}
