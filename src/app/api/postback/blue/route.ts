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
import { notificarEvento, enviarPush } from "@/lib/push";
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!compararSecreto(url.searchParams.get("key"), process.env.POSTBACK_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const event = pick(url, ["event"]).toLowerCase();
  // Etiqueta del afiliado: sub1..sub3 (lo que añadimos al enlace), luego campaña/clickid.
  const tag = pick(url, ["sub1", "s1", "sub2", "s2", "sub3", "s3", "campaign", "campaign_slug", "clickid"]);
  // Id del jugador (hash estable de Blue) o cualquier id alternativo.
  const playerid = pick(url, ["player", "player_token", "playerid", "player_id", "txid", "transaction_id", "txn"]);
  const isocountry = pick(url, ["country", "isocountry"]).toUpperCase();
  const monto = getMonto(url); // {amount}
  const raw = queryLimpia(url);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

  // ── REGISTRO ──────────────────────────────────────────────────────────────
  if (event === "registration" || event === "register" || event === "signup") {
    const target = await matchAfiliado(tag);
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
      afp: afpDeTracking(target?.freshaffs_tracking_code),
      player_id: playerid,
      isocountry,
      matched_user_id: target?.user_id ?? null,
      status: estado,
    });
    if (estado === "counted" && target) after(() => notificarEvento(target.user_id, "registration"));
    return NextResponse.json({ ok: true, event, matched: !!target, estado });
  }

  // ── FTD / RECARGA (log, NO paga) ──────────────────────────────────────────
  if (event === "ftd" || event === "deposit" || event === "redeposit") {
    const target = await matchAfiliado(tag);
    const et: "ftd" | "redeposit" = event === "ftd" ? "ftd" : "redeposit";
    // Anti-reintento en recargas (mismo jugador + importe en 2 min = reintento).
    if (et === "redeposit" && playerid) {
      const hace2min = new Date(Date.now() - 120000).toISOString();
      const { data: dup } = await supabaseAdmin
        .from("postback_events")
        .select("id")
        .eq("event_type", "redeposit")
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
      afp: afpDeTracking(target?.freshaffs_tracking_code),
      player_id: playerid,
      isocountry,
      matched_user_id: target?.user_id ?? null,
      amount: monto,
      status: "deposit", // depósito recibido, no suma dinero (el CPA va por el QFTD)
    });
    return NextResponse.json({
      ok: true,
      event,
      recibido: { tag, importe: monto, player_id: playerid, pais: isocountry },
      matched: !!target,
    });
  }

  // ── QUALIFICATION / COMMISSION_PAID = QFTD que PAGA (candado compartido) ───
  if (event === "qualification" || event === "commission_paid" || event === "commission") {
    // Comisión que nos paga la red (para detectar REVERSIÓN si viene negativa).
    const comisionRed = montoConSigno(pick(url, ["commission"]) || null);

    // REVERSIÓN: comisión negativa → el casino quitó la comisión. Si ese QFTD
    // estaba contado, se lo restamos también al afiliado (espejo con la red).
    if (Number.isFinite(comisionRed) && comisionRed < 0 && playerid) {
      let estadoRev: EstadoEvento = "no_match";
      const contado = await buscarQftdContado(playerid);
      if (contado) {
        const revKey = `qftdrev:${contado.id}`;
        if (await reclamarEvento(revKey)) {
          const { error } = await supabaseAdmin.rpc("increment_daily_stats", {
            p_user_id: contado.userId,
            p_date: contado.date,
            p_registrations: 0,
            p_ftd: -1,
            p_commission: -contado.commission,
          });
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
    const target = await matchAfiliado(tag);
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
      afp: afpDeTracking(target?.freshaffs_tracking_code),
      player_id: playerid,
      isocountry,
      matched_user_id: target?.user_id ?? null,
      commission: comisionPagada,
      amount: monto, // importe del depósito cualificado (Celsius sí lo manda)
      status: estado,
    });
    if (estado === "counted" && target) {
      await notificarEvento(target.user_id, "ftd", comisionPagada);
      const pais = isocountry ? ` de ${isocountry}` : "";
      await enviarPush(ADMIN_USER_ID, {
        title: "💰 ¡Depósito cualificado!",
        body:
          comisionPagada > 0
            ? `Un jugador${pais} ha cualificado 🔥 Ganas ${comisionPagada}€.`
            : `Un jugador${pais} ha cualificado 🔥`,
        url: "/admin/actividad",
      });
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
