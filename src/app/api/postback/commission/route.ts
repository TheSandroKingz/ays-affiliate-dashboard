import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getPlayerId,
  reclamarEvento,
  liberarEvento,
  registrarEvento,
  ftdYaContado,
  depositoPrevio,
  buscarQftdContado,
  queryLimpia,
  type EstadoEvento,
} from "@/lib/postback";
import { notificarEvento, enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";
import { esCuentaPropia } from "@/lib/adminId";

// QFTD (depósito CUALIFICADO): FreshBet manda este postback cuando GENERA la
// comisión, es decir, cuando el depósito cualifica. ESTE es el evento que PAGA:
// aquí sumamos el FTD del afiliado y su CPA. El postback de "ftd" a secas es
// cualquier primer depósito (no cualificado) y NO suma dinero.
//
// SALVAGUARDAS (imposible colar dinero falso):
//  1) Debe emparejar con un afiliado (por trackingcode o afp).
//  2) Debe traer player_id (userid), o no contamos.
//  3) Debe existir un DEPÓSITO previo de ese jugador (postback de FTD). Así, los
//     tests de FreshBet (jugador inventado, sin depósito) nunca cuentan.
//  4) Candado por jugador + retención si ya estaba contado (anti-doble-pago).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!process.env.POSTBACK_SECRET || key !== process.env.POSTBACK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const afp = url.searchParams.get("afp") ?? "";
  const trackingcode = url.searchParams.get("trackingcode") ?? "";
  const isocountry = (url.searchParams.get("isocountry") ?? "").toUpperCase();
  const playerid = getPlayerId(url);
  const importe = Number(
    (url.searchParams.get("commissionamount") ?? "").replace(",", ".")
  );

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // REVERSIÓN: si FreshBet manda una comisión NEGATIVA, te la está QUITANDO
  // (fraude/chargeback). Si ese QFTD estaba contado, se lo restamos también al
  // afiliado para quedar espejo con FreshBet. Candado para no revertir dos veces.
  if (Number.isFinite(importe) && importe < 0 && playerid) {
    let estadoRev: EstadoEvento = "no_match";
    const revKey = `qftdrev:${playerid}`;
    const nuevo = await reclamarEvento(revKey);
    if (nuevo) {
      const contado = await buscarQftdContado(playerid);
      if (contado) {
        const { error } = await supabaseAdmin.rpc("increment_daily_stats", {
          p_user_id: contado.userId,
          p_date: contado.date,
          p_registrations: 0,
          p_ftd: -1,
          p_commission: -contado.commission,
        });
        if (error) {
          await liberarEvento(revKey);
          estadoRev = "error";
        } else {
          estadoRev = "reversed";
        }
      } else {
        estadoRev = "no_match"; // no había nada contado que revertir
      }
    } else {
      estadoRev = "duplicate"; // reversión ya aplicada
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

    if (estadoRev === "reversed") {
      after(() =>
        enviarPush(ADMIN_USER_ID, {
          title: "↩️ Comisión revertida",
          body: "FreshBet quitó una comisión y se ha restado también al afiliado.",
          url: "/admin/actividad",
        })
      );
    }
    return NextResponse.json({ ok: true, reversed: estadoRev === "reversed" });
  }

  // Atribución al afiliado (por trackingcode y, si no, por afp).
  let target: { user_id: string; cpa_spain: number | null; cpa_other: number | null } | null = null;
  if (trackingcode) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, cpa_spain, cpa_other")
      .ilike("freshaffs_tracking_code", trackingcode.replace(/[%_]/g, "\\$&"))
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

  if (target && playerid) {
    // Salvaguarda 3: si NO hay depósito previo de este jugador, no contamos
    // AUTOMÁTICAMENTE (podría ser ruido de test), pero tampoco lo perdemos: lo
    // dejamos RETENIDO para que el admin lo revise. Así un QFTD real cuyo
    // depósito no quedó registrado NUNCA se pierde (lo apruebas de un clic), y un
    // test se descarta igual. Nunca se cuenta un falso ni se pierde un real.
    const hayDeposito = await depositoPrevio(playerid);
    if (!hayDeposito) {
      estado = "held";
    } else {
      const eventKey = `qftd:${playerid}`;
      const contar = await reclamarEvento(eventKey);
      duplicado = !contar;
      if (contar) {
        // Si este jugador YA tenía un FTD/QFTD contado, NO sumamos: retenido.
        const yaContado = await ftdYaContado(playerid);
        if (yaContado) {
          estado = "held";
        } else {
          // Cuenta propia del admin (Mongolitos): NO se le acredita comisión
          // (el dinero es del admin, se queda como margen entero). El FTD sí
          // cuenta, y su CPA se muestra en su panel, pero no genera "le pago".
          const esOtroPais = isocountry && isocountry !== "ES";
          const commission = esCuentaPropia(target.user_id)
            ? 0
            : Number((esOtroPais ? target.cpa_other : target.cpa_spain) ?? 0);
          const { error } = await supabaseAdmin.rpc("increment_daily_stats", {
            p_user_id: target.user_id,
            p_date: today,
            p_registrations: 0,
            p_ftd: 1,
            p_commission: commission,
          });
          if (error) {
            await liberarEvento(eventKey);
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

  // Avisos push (sin retrasar la respuesta).
  if (estado === "counted" && target) {
    after(() => notificarEvento(target.user_id, "ftd"));
  }
  if (estado === "held") {
    after(() =>
      enviarPush(ADMIN_USER_ID, {
        title: "⚠️ QFTD retenido",
        body: "Un QFTD quedó sin contar por sospecha de doble pago. Revísalo en Actividad.",
        url: "/admin/actividad",
      })
    );
  }

  return NextResponse.json({ ok: true, matched: !!target, duplicado });
}
