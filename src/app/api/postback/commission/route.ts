import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { compararSecreto } from "@/lib/secreto";
import {
  getPlayerId,
  reclamarEvento,
  liberarEvento,
  registrarEvento,
  ftdYaContado,
  buscarQftdContado,
  montoConSigno,
  queryLimpia,
  type EstadoEvento,
} from "@/lib/postback";
import { notificarEvento, enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";

// QFTD (depósito CUALIFICADO): FreshBet manda este postback cuando GENERA la
// comisión, es decir, cuando el depósito cualifica. ESTE es el evento que PAGA:
// aquí sumamos el FTD del afiliado y su CPA. El postback de "ftd" a secas es
// cualquier primer depósito (no cualificado) y NO suma dinero.
//
// SALVAGUARDAS (imposible colar dinero falso ni pagar dos veces):
//  1) Debe emparejar con un afiliado (por trackingcode o afp).
//  2) Debe traer player_id (userid), o no contamos.
//  3) Candado por jugador (postback_dedup): el MISMO QFTD nunca cuenta dos veces.
//  4) Si el jugador YA tenía un QFTD contado, se retiene (anti doble-pago).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!compararSecreto(key, process.env.POSTBACK_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const afp = url.searchParams.get("afp") ?? "";
  const trackingcode = url.searchParams.get("trackingcode") ?? "";
  const isocountry = (url.searchParams.get("isocountry") ?? "").toUpperCase();
  const playerid = getPlayerId(url);
  // Importe CON SIGNO y separadores robustos: si es negativo = reversión/chargeback.
  const importe = montoConSigno(url.searchParams.get("commissionamount"));

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // REVERSIÓN: si FreshBet manda una comisión NEGATIVA, te la está QUITANDO
  // (fraude/chargeback). Si ese QFTD estaba contado, se lo restamos también al
  // afiliado para quedar espejo con FreshBet. Candado para no revertir dos veces.
  if (Number.isFinite(importe) && importe < 0 && playerid) {
    let estadoRev: EstadoEvento = "no_match";
    // Buscamos PRIMERO el QFTD contado a revertir, y el candado va por EVENTO
    // (qftdrev:<id>), no por jugador-de-por-vida. Así, si el jugador recualifica
    // (nuevo evento contado) y FreshBet lo revierte otra vez, esa 2ª reversión
    // legítima también se aplica en vez de perderse como "duplicado".
    const contado = await buscarQftdContado(playerid);
    if (contado) {
      const revKey = `qftdrev:${contado.id}`;
      const nuevo = await reclamarEvento(revKey);
      if (nuevo) {
        const { error } = await supabaseAdmin.rpc("increment_daily_stats", {
          p_user_id: contado.userId,
          p_date: contado.date,
          p_registrations: 0,
          p_ftd: -1,
          p_commission: -contado.commission,
        });
        if (error) {
          // NO soltamos el candado: el RPC pudo haber CONFIRMADO en Postgres
          // aunque devolviera error (timeout tras commit). Si lo soltáramos, un
          // reintento de FreshBet restaría OTRA VEZ (doble reversión silenciosa).
          // Lo dejamos reclamado → el reintento cae en "duplicate". Se avisa para
          // revisar a mano. Mismo criterio que el resolver.
          estadoRev = "error";
        } else {
          estadoRev = "reversed";
          // SEGUNDO GUARDIA (independiente del candado): marcamos el evento
          // contado de ORIGEN como no-contado, para que un reintento de la
          // reversión NO lo vuelva a encontrar y reste el CPA otra vez (evita el
          // doble descuento si el candado fallara). Además liberamos el candado
          // del QFTD por si el jugador RECUALIFICA de verdad más adelante (así el
          // nuevo QFTD legítimo vuelve a contar en vez de caer como duplicado).
          await supabaseAdmin
            .from("postback_events")
            .update({ counted: false })
            .eq("id", contado.id)
            .then(() => {}, () => {});
          await liberarEvento(`qftd:${playerid}`);
        }
      } else {
        estadoRev = "duplicate"; // ese evento ya se revirtió
      }
    } else {
      estadoRev = "no_match"; // no había nada contado que revertir
    }

    await registrarEvento({
      event_type: "commission",
      raw_query: queryLimpia(url),
      tracking_code: trackingcode,
      afp,
      player_id: playerid,
      isocountry,
      matched_user_id: null,
      commission: Number.isFinite(importe) ? importe : 0,
      status: estadoRev,
    });

    // Avisos GARANTIZADOS (await, no best-effort): enviarPush es blindado y no
    // rompe; esperarlo asegura que el aviso de reversión/error llegue de verdad.
    if (estadoRev === "reversed") {
      await enviarPush(ADMIN_USER_ID, {
        title: "↩️ Comisión revertida",
        body: "FreshBet quitó una comisión y se ha restado también al afiliado.",
        url: "/admin/actividad",
      });
    }
    if (estadoRev === "error") {
      await enviarPush(ADMIN_USER_ID, {
        title: "⚠️ Error al revertir una comisión",
        body: "Una reversión dio error de red. Puede haberse aplicado o no — revisa el balance del afiliado a mano.",
        url: "/admin/actividad",
      });
    }
    return NextResponse.json({ ok: true, reversed: estadoRev === "reversed" });
  }

  // Atribución al afiliado (por trackingcode y, si no, por afp).
  let target: { user_id: string; cpa_spain: number | null; cpa_other: number | null } | null = null;
  if (trackingcode) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, cpa_spain, cpa_other")
      .ilike("freshaffs_tracking_code", trackingcode.replace(/[\\%_*]/g, "\\$&"))
      .limit(1);
    target = data?.[0] ?? null;
  }
  if (!target && afp) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, cpa_spain, cpa_other")
      .eq("freshaffs_affiliate_id", afp)
      .limit(1);
    target = data?.[0] ?? null;
  }

  let duplicado = false;
  let estado: EstadoEvento = "no_match";
  let comisionPagada = 0;
  // Único motivo de retención que queda: "double_pay" = el jugador YA tenía un
  // QFTD contado (posible doble pago). Es lo único delicado y lo único que avisa.
  let heldReason: "double_pay" | null = null;

  if (target && playerid) {
    // Contamos el QFTD EN CUANTO FreshBet manda la comisión (es lo que paga).
    // Ya NO exigimos un "depósito previo" registrado: eso retenía TODOS los QFTD
    // reales cuando FreshBet mandaba la comisión antes (o sin) el aviso de depósito.
    // PROTECCIONES QUE SE MANTIENEN — para que NADIE cuente ni cobre dos veces:
    //  - Candado por jugador (reclamarEvento): el MISMO QFTD nunca cuenta 2 veces,
    //    aunque FreshBet reintente el postback.
    //  - ftdYaContado: si el jugador YA tenía un QFTD contado, NO se vuelve a sumar
    //    (queda retenido para revisar) → cero doble pago.
    const eventKey = `qftd:${playerid}`;
    const contar = await reclamarEvento(eventKey);
    duplicado = !contar;
    if (contar) {
      // Si este jugador YA tenía un FTD/QFTD contado, NO sumamos (evita doble pago).
      const yaContado = await ftdYaContado(playerid);
      if (yaContado) {
        estado = "held";
        heldReason = "double_pay";
      } else {
        // Otro país usa cpa_other; si no está puesto, cae a cpa_spain (el plan es
        // el mismo importe por QFTD) para no contar el FTD pagando 0 y quemar el
        // candado. País vacío = se trata como España.
        const esOtroPais = isocountry && isocountry !== "ES";
        const commission = Number(
          (esOtroPais ? target.cpa_other ?? target.cpa_spain : target.cpa_spain) ?? 0
        );
        const { error } = await supabaseAdmin.rpc("increment_daily_stats", {
          p_user_id: target.user_id,
          p_date: today,
          p_registrations: 0,
          p_ftd: 1,
          p_commission: commission,
        });
        if (error) {
          // NO soltamos el candado: el RPC pudo haber CONFIRMADO en Postgres
          // aunque devolviera error (timeout tras el commit). Dejándolo reclamado,
          // el reintento de FreshBet cae en "duplicate" → nunca doble pago.
          estado = "error";
        } else {
          estado = "counted";
          comisionPagada = commission;
        }
      }
    } else {
      estado = "duplicate";
    }
  }

  // Caja negra: registramos SIEMPRE (event_type "commission" = QFTD).
  await registrarEvento({
    event_type: "commission",
    raw_query: queryLimpia(url),
    tracking_code: trackingcode,
    afp,
    player_id: playerid,
    isocountry,
    matched_user_id: target?.user_id ?? null,
    commission: comisionPagada,
    status: estado,
  });

  // Avisos GARANTIZADOS (await, no best-effort). El RPC del dinero ya se hizo
  // ARRIBA; esto solo manda el push, que es blindado. Esperarlo asegura que el
  // aviso llegue (antes iba con after() y podía perderse según el hosting).
  // Pasamos el importe acreditado para que el aviso diga cuánto se gana/llevas.
  if (estado === "counted" && target) {
    await notificarEvento(target.user_id, "ftd", comisionPagada);
  }
  // Solo avisamos si es un POSIBLE DOBLE PAGO (jugador ya contado). Las
  // retenciones "sin depósito" son casi siempre pruebas de FreshBet o disparos
  // prematuros: se aparcan calladas (siguen visibles en Actividad por si acaso),
  // pero NO te bombardean con avisos cada vez que el manager hace un test.
  if (estado === "held" && heldReason === "double_pay") {
    await enviarPush(ADMIN_USER_ID, {
      title: "⚠️ Posible doble pago",
      body: "Un QFTD de un jugador que ya estaba contado quedó retenido. Revísalo en Actividad.",
      url: "/admin/actividad",
    });
  }
  if (estado === "error" && target) {
    await enviarPush(ADMIN_USER_ID, {
      title: "⚠️ Error al contar un QFTD",
      body: "Un QFTD dio error de red al sumar. Puede haberse sumado o no — revisa el balance del afiliado a mano (no habrá doble pago).",
      url: "/admin/actividad",
    });
  }

  return NextResponse.json({ ok: true, matched: !!target, duplicado });
}
