import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { compararSecreto } from "@/lib/secreto";
import {
  reclamarEvento,
  liberarEvento,
  registrarEvento,
  ftdYaContado,
  buscarQftdContado,
  montoConSigno,
  getMonto,
  queryLimpia,
  type EstadoEvento,
} from "@/lib/postback";
import { notificarEvento, enviarPush, avisarDepositoBotYaiza } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";
import { botPorTracking } from "@/lib/bots";

// ============================================================================
// Receptor UNIFICADO de los postbacks de BLUE AFFILIATES (casino Celsius).
// Blue manda UNA sola URL con la macro {event}, así que aquí enrutamos según el
// evento. Autenticación por nuestra ?key= (igual que los postbacks antiguos: se
// mete literal en la plantilla de Blue; su firma {sig} no se usa).
//
// Eventos de Blue → nuestra lógica de SIEMPRE:
//   registration                    → cuenta un registro del afiliado
//   ftd                             → log del primer depósito (NO paga)
//   deposit                         → log de recarga (NO paga)
//   qualification / commission_paid → QFTD que PAGA el CPA. Candado COMPARTIDO
//        (qftd:<jugador>): se paga UNA sola vez por jugador, venga por el evento
//        que venga, así no dependemos de cuál de los dos usa Blue para cualificar.
//
// Atribución al afiliado: la etiqueta llega en sub1..sub3 (lo que añadimos al
// enlace) o en campaign_slug/clickid; se empareja contra freshaffs_tracking_code
// (o freshaffs_affiliate_id). El id del jugador es {player_token} (hash estable:
// mismo jugador = mismo token → sirve igual para no contar dos veces).
// BLINDADO y con caja negra: TODO evento se registra en postback_events.
// ============================================================================

function pick(url: URL, names: string[]): string {
  for (const n of names) {
    const v = url.searchParams.get(n);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

type Afiliado = {
  user_id: string;
  cpa_spain: number | null;
  cpa_other: number | null;
  freshaffs_tracking_code: string | null;
};

const SEL = "user_id, cpa_spain, cpa_other, freshaffs_tracking_code";

async function matchAfiliado(tag: string): Promise<Afiliado | null> {
  if (tag) {
    // 1) por tracking code (insensible a mayúsculas, escapando comodines)
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select(SEL)
      .ilike("freshaffs_tracking_code", tag.replace(/[\\%_*]/g, "\\$&"))
      .limit(1);
    if (data?.[0]) return data[0];
    // 2) por affiliate id exacto
    const { data: d2 } = await supabaseAdmin
      .from("affiliates")
      .select(SEL)
      .eq("freshaffs_affiliate_id", tag)
      .limit(1);
    if (d2?.[0]) return d2[0];
  }
  // 3) POR DEFECTO: si no hay etiqueta o no empareja con ningún afiliado, va a la
  // cuenta de la casa/bot (tracking code "Default" = Mongolitos), igual que antes
  // (el tráfico del bot entraba como trackingcode=Default). Así TU tráfico sale en
  // el dashboard aunque el enlace directo de Celsius no traiga sub1. Los afiliados
  // con su ?s1=<código> propio SÍ emparejan arriba y se llevan lo suyo.
  const { data: def } = await supabaseAdmin
    .from("affiliates")
    .select(SEL)
    .ilike("freshaffs_tracking_code", "Default")
    .limit(1);
  return def?.[0] ?? null;
}

// afp del bot al que pertenece el afiliado (bot/botmn/botdm), para que los paneles
// que agrupan por afp (Estado de bots, "mi bot") sigan funcionando igual que antes.
// Mongolitos/Default no está en el registro de bots nuevos → afp "bot" (el de Sandro).
function afpDeTracking(tc: string | null | undefined): string {
  return botPorTracking(tc || "")?.afp ?? "bot";
}
async function afpDeUser(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("freshaffs_tracking_code")
    .eq("user_id", userId)
    .limit(1);
  return afpDeTracking(data?.[0]?.freshaffs_tracking_code as string | null);
}

// ── Enlaces DEDICADOS de cada BOT de Telegram (los creó la red en Blue). Cada
// bot manda SU código, así el panel de cada bot cuenta SOLO su tráfico, separado
// del tráfico del socio/Instagram (que usa OTROS códigos → afp "web", no es bot).
// El afp sale del CÓDIGO del enlace (tag), NO del afiliado (antes todo lo que caía
// en la casa/Default se marcaba "bot" y mezclaba el Instagram del socio).
const AFP_CAMPANA: Record<string, string> = {
  ymijpivpyx: "bot", // BOT AS  (bot de Sandro)
  ishrdbxnke: "botmn", // BOT JEFFER (bot de Jeffer)
  ahbpxgtaop: "botdm", // bot de Mariam/Alana (su enlace de siempre)
};
// Dinero: si el código de un bot pertenece a un afiliado concreto, con qué
// tracking se empareja para atribuírselo (BOT JEFFER → cuenta de Jeffer).
const DUENO_CAMPANA: Record<string, string> = {
  ishrdbxnke: "cZahjDgQoR", // el dinero de BOT JEFFER va a la cuenta de Jeffer
};
// afp para los PANELES de bot, a partir del código del enlace. Lo que no sea un
// enlace de bot conocido (Instagram del socio, directos, etc.) → "web" (no bot).
function afpDeCampana(tag: string): string {
  return AFP_CAMPANA[(tag || "").trim().toLowerCase()] ?? "web";
}
// Código con el que emparejar el DINERO (resuelve el dueño si es un enlace de bot).
function codigoParaMatch(tag: string): string {
  return DUENO_CAMPANA[(tag || "").trim().toLowerCase()] ?? tag;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!compararSecreto(url.searchParams.get("key"), process.env.POSTBACK_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const event = pick(url, ["event"]).toLowerCase();
  // Etiqueta del afiliado: sub1..sub3 (lo que añadimos al enlace) y, si acaso, la
  // campaña. NO usamos clickid (es único por click, nunca es un código de afiliado
  // → ensuciaría el emparejado). Sin etiqueta → cae en el afiliado por defecto.
  // El identificador del afiliado llega en `campaign` (el código del enlace de
  // Celsius: YmIjpivpyx, iSHRdbxNKE, AhBpxgTaoP…). Lo miramos PRIMERO; los subN
  // son solo respaldo por si algún enlace los usara. (Antes iban primero los sub
  // y, si Blue rellenara sub1 con un clickid, el dinero caía en Default por error.)
  const tag = pick(url, ["campaign", "campaign_slug", "sub1", "s1", "sub2", "s2", "sub3", "s3"]);
  // Id del jugador (hash ESTABLE de Blue). OJO: solo identificadores de JUGADOR,
  // nunca ids de transacción (txid/transaction_id/txn): esos son únicos por
  // transacción y romperían el candado por jugador, el anti-doble-pago y la
  // reversión (que emparejan por player_id). Si no viene ninguno, playerid queda
  // vacío y el QFTD NO paga (estado seguro), mejor que pagar contra un id
  // irrepetible que ni se puede revertir ni frena el doble pago.
  const playerid = pick(url, ["player", "player_token", "playerid", "player_id", "customerid", "customer_id", "userid"]);
  const isocountry = pick(url, ["country", "isocountry"]).toUpperCase();
  const monto = getMonto(url); // {amount}
  const raw = queryLimpia(url);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

  // ── EVENTO DE PRUEBA (botón "Probar" de Blue: sub1=test-sub1, campaign=test-…) ──
  // NO debe contar ni pagar NADA: con la atribución por defecto a tu cuenta, cada
  // test se sumaría como un depósito falso. Se registra en la caja negra y se sale.
  const esTest = /^test-/i.test(tag) || /(sub[123]|s[123]|campaign|campaign_slug)=test-/i.test(raw);
  if (esTest) {
    const et = (event === "registration"
      ? "registration"
      : event === "ftd"
      ? "ftd"
      : event === "deposit"
      ? "redeposit"
      : "commission") as "registration" | "ftd" | "commission" | "redeposit";
    await registrarEvento({
      event_type: et,
      raw_query: raw,
      tracking_code: tag,
      afp: "",
      player_id: playerid,
      isocountry,
      matched_user_id: null,
      status: "no_match",
    });
    return NextResponse.json({ ok: true, test: true, nota: "evento de prueba: registrado pero NO contado" });
  }

  // ── REGISTRO ──────────────────────────────────────────────────────────────
  if (event === "registration" || event === "register" || event === "signup") {
    const target = await matchAfiliado(codigoParaMatch(tag));
    let estado: EstadoEvento = "no_match";
    if (target) {
      let contar: boolean;
      if (playerid) {
        contar = await reclamarEvento(`reg:${playerid}`);
      } else {
        const hace5min = new Date(Date.now() - 300000).toISOString();
        const { data: dup } = await supabaseAdmin
          .from("postback_events")
          .select("id")
          .eq("event_type", "registration")
          .eq("raw_query", raw)
          .gte("created_at", hace5min)
          .limit(1);
        contar = !(dup && dup.length);
      }
      if (contar) {
        const { error } = await supabaseAdmin.rpc("increment_daily_stats", {
          p_user_id: target.user_id,
          p_date: today,
          p_registrations: 1,
          p_ftd: 0,
          p_commission: 0,
        });
        estado = error ? "error" : "counted";
      } else {
        estado = "duplicate";
      }
    }
    await registrarEvento({
      event_type: "registration",
      raw_query: raw,
      tracking_code: tag,
      afp: afpDeCampana(tag),
      player_id: playerid,
      isocountry,
      matched_user_id: target?.user_id ?? null,
      status: estado,
    });
    if (estado === "counted" && target)
      after(() => notificarEvento(target.user_id, "registration", undefined, afpDeCampana(tag), isocountry));
    return NextResponse.json({ ok: true, event, matched: !!target, estado });
  }

  // ── FTD / RECARGA (log, NO paga) ──────────────────────────────────────────
  if (event === "ftd" || event === "deposit" || event === "redeposit") {
    const target = await matchAfiliado(codigoParaMatch(tag));
    const et: "ftd" | "redeposit" = event === "ftd" ? "ftd" : "redeposit";
    // Anti-reintento (mismo jugador + mismo tipo + mismo importe en 2 min = reintento
    // de Blue). Vale para ftd y recarga: no suma dinero pero evita inflar contadores.
    if (playerid) {
      const hace2min = new Date(Date.now() - 120000).toISOString();
      const { data: dup } = await supabaseAdmin
        .from("postback_events")
        .select("id")
        .eq("event_type", et)
        .eq("player_id", playerid)
        .eq("amount", monto)
        .gte("created_at", hace2min)
        .limit(1);
      if (dup && dup.length) return NextResponse.json({ ok: true, duplicado: true });
    }
    await registrarEvento({
      event_type: et,
      raw_query: raw,
      tracking_code: tag,
      afp: afpDeCampana(tag),
      player_id: playerid,
      isocountry,
      matched_user_id: target?.user_id ?? null,
      amount: monto,
      status: "deposit", // depósito recibido, no suma dinero (el CPA va por el QFTD)
    });
    // Si es una RECARGA por un bot, avisamos a Yaiza (el FTD nuevo se avisa en el
    // evento de comisión, más abajo).
    if (et === "redeposit")
      after(() => avisarDepositoBotYaiza(afpDeCampana(tag), "recarga"));
    return NextResponse.json({
      ok: true,
      event,
      recibido: { tag, importe: monto, player_id: playerid, pais: isocountry },
      matched: !!target,
    });
  }

  // ── QUALIFICATION / COMMISSION_PAID = QFTD que PAGA el CPA (candado
  // compartido). En Blue, el QFTD (depósito cualificado) es lo que genera la
  // comisión/ingreso y llega como evento "qualification"; ahí se acredita el CPA
  // (una sola vez por jugador, gracias al candado). ──────────────────────────
  if (event === "qualification" || event === "commission_paid" || event === "commission") {
    // Comisión que nos paga la red (para detectar REVERSIÓN si viene negativa).
    // Probamos varios nombres de campo por si Blue no la manda en "commission"
    // (si no, una reversión pasaría desapercibida y el afiliado se quedaría el
    // dinero que el casino le quitó). Si no hay comisión, miramos un amount negativo.
    const comisionRed = montoConSigno(
      pick(url, ["commission", "commission_amount", "commissionamount", "payout", "revenue"]) ||
        pick(url, ["amount"]) ||
        null
    );

    // REVERSIÓN: comisión negativa → el casino quitó la comisión. Si ese QFTD
    // estaba contado, se lo restamos también al afiliado (espejo con la red).
    if (Number.isFinite(comisionRed) && comisionRed < 0 && playerid) {
      let estadoRev: EstadoEvento = "no_match";
      const contado = await buscarQftdContado(playerid);
      if (contado) {
        const revKey = `qftdrev:${contado.id}`;
        if (await reclamarEvento(revKey)) {
          // El CONTADOR de FTD (-1) SIEMPRE se resta en el MES REAL del QFTD, para
          // que el recuento de FTD de cada mes cuadre (si lo restáramos en el mes
          // vigente, descuadraría los FTD del mes en curso, incluso a negativo).
          // El CLAWBACK de dinero (-commission) se resta en el mes VIGENTE cuando el
          // QFTD original es de un mes ya cerrado (y pagado), para reducir el saldo
          // actual; si es del mismo mes, todo va en su fecha (una sola llamada).
          const mismoMes = contado.date.slice(0, 7) === today.slice(0, 7);
          let error = null as unknown;
          if (mismoMes) {
            ({ error } = await supabaseAdmin.rpc("increment_daily_stats", {
              p_user_id: contado.userId,
              p_date: contado.date,
              p_registrations: 0,
              p_ftd: -1,
              p_commission: -contado.commission,
            }));
          } else {
            const rCont = await supabaseAdmin.rpc("increment_daily_stats", {
              p_user_id: contado.userId,
              p_date: contado.date, // FTD -1 en su mes real (cuadra el recuento)
              p_registrations: 0,
              p_ftd: -1,
              p_commission: 0,
            });
            const rDinero = await supabaseAdmin.rpc("increment_daily_stats", {
              p_user_id: contado.userId,
              p_date: today, // clawback de dinero en el mes vigente
              p_registrations: 0,
              p_ftd: 0,
              p_commission: -contado.commission,
            });
            error = rCont.error || rDinero.error;
          }
          if (error) {
            estadoRev = "error";
          } else {
            estadoRev = "reversed";
            await supabaseAdmin
              .from("postback_events")
              .update({ counted: false })
              .eq("id", contado.id)
              .then(() => {}, () => {});
            await liberarEvento(`qftd:${playerid}`);
          }
        } else {
          estadoRev = "duplicate";
        }
      }
      await registrarEvento({
        event_type: "commission",
        raw_query: raw,
        tracking_code: tag,
        afp: contado ? await afpDeUser(contado.userId) : "bot",
        player_id: playerid,
        isocountry,
        matched_user_id: contado?.userId ?? null,
        commission: Number.isFinite(comisionRed) ? comisionRed : 0,
        status: estadoRev,
      });
      if (estadoRev === "reversed") {
        await enviarPush(ADMIN_USER_ID, {
          title: "↩️ Comisión revertida",
          body: "El casino quitó una comisión y se ha restado también al afiliado.",
          url: "/admin/actividad",
        });
      }
      return NextResponse.json({ ok: true, reversed: estadoRev === "reversed" });
    }

    // QFTD normal: emparejar, candado por jugador, retener si ya estaba contado,
    // y pagar el CPA (nuestro plan, no la comisión de la red).
    const target = await matchAfiliado(codigoParaMatch(tag));
    let estado: EstadoEvento = "no_match";
    let comisionPagada = 0;
    let heldReason: "double_pay" | null = null;
    if (target && playerid) {
      const contar = await reclamarEvento(`qftd:${playerid}`);
      if (contar) {
        if (await ftdYaContado(playerid)) {
          estado = "held";
          heldReason = "double_pay";
        } else {
          const esOtro = isocountry && isocountry !== "ES";
          const commission = Number(
            (esOtro ? target.cpa_other ?? target.cpa_spain : target.cpa_spain) ?? 0
          );
          const { error } = await supabaseAdmin.rpc("increment_daily_stats", {
            p_user_id: target.user_id,
            p_date: today,
            p_registrations: 0,
            p_ftd: 1,
            p_commission: commission,
          });
          if (error) {
            // A PROPÓSITO no liberamos el candado: el RPC pudo CONFIRMAR en
            // Postgres aunque devolviera error (timeout tras commit). Liberarlo
            // haría que un reintento SUMARA otra vez (doble pago). Preferimos NO
            // contar (queda status=error para revisión manual) antes que arriesgar
            // un doble pago. Mismo criterio que el endpoint viejo de comisión.
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
    await registrarEvento({
      event_type: "commission",
      raw_query: raw,
      tracking_code: tag,
      afp: afpDeCampana(tag),
      player_id: playerid,
      isocountry,
      matched_user_id: target?.user_id ?? null,
      commission: comisionPagada,
      amount: monto, // importe del depósito cualificado (Celsius sí lo manda)
      status: estado,
    });
    if (estado === "counted" && target) {
      // Una sola notificación (la de siempre): notificarEvento ya avisa al
      // afiliado y, si es tráfico propio/tuyo, a ti UNA vez. Sin push extra.
      // Si el FTD vino por un bot (afp bot/botmn/botdm), el aviso lo dice.
      await notificarEvento(
        target.user_id,
        "ftd",
        comisionPagada,
        afpDeCampana(tag),
        isocountry
      );
      // Aviso a Yaiza: FTD NUEVO por este bot (diciendo de qué bot es).
      after(() => avisarDepositoBotYaiza(afpDeCampana(tag), "ftd"));
    }
    if (estado === "held" && heldReason === "double_pay") {
      await enviarPush(ADMIN_USER_ID, {
        title: "⚠️ Posible doble pago",
        body: "Un QFTD de un jugador que ya estaba contado quedó retenido. Revísalo en Actividad.",
        url: "/admin/actividad",
      });
    }
    return NextResponse.json({ ok: true, matched: !!target, estado });
  }

  // ── Evento no reconocido: a la caja negra tal cual, para verlo y ajustar. ──
  await registrarEvento({
    event_type: "registration",
    raw_query: `[event=${event || "?"}] ${raw}`,
    tracking_code: tag,
    afp: "",
    player_id: playerid,
    isocountry,
    matched_user_id: null,
    status: "no_match",
  });
  return NextResponse.json({ ok: true, event, nota: "evento no reconocido; guardado en la caja negra" });
}
