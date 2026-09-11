import webpush from "web-push";
import { supabaseAdmin } from "./supabaseAdmin";
import { ADMIN_USER_ID } from "./adminAuth";
import { esCuentaPropia, YAIZA_ID } from "./adminId";

// Notificaciones push (Web Push / PWA). Enviamos avisos al móvil de un usuario
// (afiliado o admin) cuando ocurre algo (registro, FTD). BLINDADO: cualquier
// fallo aquí NUNCA debe romper el flujo que lo llama (p. ej. un postback).

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

let configurado = false;
function configurar(): boolean {
  if (configurado) return true;
  if (!PUBLIC || !PRIVATE) return false;
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configurado = true;
    return true;
  } catch {
    return false;
  }
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

// Envía una notificación a TODOS los dispositivos de un usuario. Borra las
// suscripciones muertas (404/410). Nunca lanza.
export async function enviarPush(
  userId: string | null | undefined,
  payload: PushPayload
): Promise<void> {
  if (!userId) return;
  if (!configurar()) return;
  try {
    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (error || !subs || !subs.length) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          // ⏱️ Sin tope, un endsentry de FCM/APNs colgado se comía los 60s de la
          // función (esto se llama desde crons y desde el postback).
          await Promise.race([
            webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body
            ),
            new Promise((_r, rej) =>
              setTimeout(() => rej(new Error("push timeout")), 5000)
            ),
          ]);
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode;
          // Suscripción caducada, revocada o con claves corruptas: la borramos
          // para no reintentarla en cada aviso el resto de su vida. El 403 y el
          // 400 (VAPID cambiada, claves rotas) tampoco se recuperan solos.
          if (code === 404 || code === 410 || code === 403 || code === 400) {
            await supabaseAdmin
              .from("push_subscriptions")
              .delete()
              .eq("id", s.id)
              .then(() => {}, () => {});
          }
        }
      })
    );
  } catch {
    // Nunca romper el flujo que llama.
  }
}

export type TipoNotif = "ftd" | "registration" | "bot_msg" | "bot_deposito";

const COL_NOTIF: Record<TipoNotif, string> = {
  ftd: "notif_ftd",
  registration: "notif_registro",
  bot_msg: "notif_bot_msg", // Yaiza: alguien escribe al bot
  bot_deposito: "notif_bot_deposito", // Yaiza: alguien deposita por el bot
};

// ¿El usuario quiere que le avisen de este tipo de evento? Lee sus preferencias.
// Por defecto (o si la columna aún no existe): activado.
export async function quiereNotif(userId: string, tipo: TipoNotif): Promise<boolean> {
  const col = COL_NOTIF[tipo];
  try {
    const { data, error } = await supabaseAdmin
      .from("affiliates")
      .select(col)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return true; // columna ausente aún → comportamiento previo (avisar)
    const v = (data as Record<string, unknown> | null)?.[col];
    return v === null || v === undefined ? true : !!v;
  } catch {
    return true;
  }
}

// Formatea un importe para el aviso: "+85 €".
const fmtMonto = (n: number) =>
  `+${Math.round(n).toLocaleString("de-DE")} €`;

// CPA del admin para calcular tu margen por un FTD de un afiliado. Sensible al
// país igual que la comisión del afiliado: si el FTD es de fuera de España, usa
// el cpa_other del admin (con respaldo a cpa_spain). Blindado: null si no se puede.
// Lo que se le paga al PADRE de este afiliado por el FTD de su hijo (override).
// Sale de lo que se queda el admin, así que hay que restarlo para que el aviso
// diga la verdad. Si no tiene padre, 0. BLINDADO: ante cualquier fallo, 0.
async function overrideDelPadre(userId: string, comision: number): Promise<number> {
  try {
    const { data: hijo } = await supabaseAdmin
      .from("affiliates")
      .select("referred_by")
      .eq("user_id", userId)
      .maybeSingle();
    const padre = hijo?.referred_by;
    if (!padre) return 0;
    // ⚠️ `referred_by` guarda el ID DE LA FILA del padre, no su user_id (igual que
    // en adminStats, que empareja por `a.id`). Buscarlo por user_id no encuentra
    // nada y el override saldría 0, o sea el aviso inflado otra vez.
    const { data: p } = await supabaseAdmin
      .from("affiliates")
      .select("subaffiliate_percent, user_id")
      .eq("id", padre)
      .maybeSingle();
    // Si el padre es el propio admin, no hay override que pagar a nadie.
    if (!p || p.user_id === ADMIN_USER_ID) return 0;
    const pct = Number(p?.subaffiliate_percent ?? 0);
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    return (comision * pct) / 100;
  } catch {
    return 0;
  }
}

async function adminCpa(isocountry?: string): Promise<number | null> {
  try {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("cpa_spain, cpa_other")
      .eq("user_id", ADMIN_USER_ID)
      .maybeSingle();
    const esOtro = !!isocountry && isocountry !== "ES";
    const v = Number(esOtro ? data?.cpa_other ?? data?.cpa_spain : data?.cpa_spain);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// Notifica un evento (registro o FTD): avisa al afiliado y al admin, pero SOLO a
// quien haya activado ese tipo en sus preferencias. Si el evento es del propio
// admin (su tráfico), solo al admin. Para FTD, si se pasa `monto` (el CPA
// acreditado al afiliado), el aviso muestra la cantidad ganada. BLINDADO.
// ── ESCALONADO DE AVISOS ────────────────────────────────────────────────────
// Celsius manda su informe de comisiones CADA 6 HORAS: a las 02:00, 08:00, 14:00
// y 20:00 (hora de Madrid). Por eso los FTD entran en TANDA: se han medido hasta
// 34 en 7 segundos. Todos los avisos llegaban de golpe al móvil y se veían como
// un bloque; los repartimos para que vayan cayendo de uno en uno.
//
// Sin tabla nueva: la POSICIÓN de este FTD dentro de la tanda se deduce contando
// cuántos QFTD se contaron en el último minuto antes que él. Cada instancia
// calcula su propio hueco, así que funciona aunque cada postback caiga en una
// instancia distinta.
// 1,5s de hueco: la tanda más grande vista (34) cabe entera dentro del tope, así
// que cada aviso tiene su propio hueco y no se amontonan al final.
const ESPACIADO_MS = 1500;
// ⏱️ Tope de espera. Antes eran 52s: con tandas grandes, todos los avisos a
// partir del nº 34 se quedaban clavados en ese tope y salían de golpe (justo lo
// que el escalonado quiere evitar), y los últimos ni salían porque la función
// moría a los 60s con el aviso ya perdido y sin reintento. Ahora se corta antes:
// a partir de ahí se manda YA, amontonado pero entregado.
const ESPERA_MAX_MS = 35_000;

async function esperarTurnoEnTanda(): Promise<void> {
  try {
    const desde = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from("postback_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "commission")
      .eq("counted", true)
      .gte("created_at", desde);
    // count incluye el evento actual → los que van DELANTE son count-1.
    const delante = Math.max(0, (count ?? 1) - 1);
    if (delante === 0) return; // el primero de la tanda sale ya
    const espera = Math.min(delante * ESPACIADO_MS, ESPERA_MAX_MS);
    await new Promise((r) => setTimeout(r, espera));
  } catch {
    /* si falla el cálculo, se manda sin escalonar */
  }
}

export async function notificarEvento(
  userId: string | null | undefined,
  tipo: TipoNotif,
  monto?: number,
  afp = "",
  isocountry?: string
): Promise<void> {
  if (!userId) return;
  const esBot = !!afp && afp.startsWith("bot");
  // ⚠️ Puede no estar en el mapa (pasó con iAfrika hasta que se añadió "botaf").
  // Sin esto salía literalmente "FTD del bot de el bot".
  const botNombre: string | null = BOT_NOMBRE[afp] ?? null;
  const esFtd = tipo === "ftd";
  const hayMonto = esFtd && typeof monto === "number" && monto > 0;
  try {
    // Las dos preferencias son independientes → en paralelo (un viaje, no dos).
    const [quiereAfiliado, quiereAdmin] = await Promise.all([
      userId !== ADMIN_USER_ID
        ? quiereNotif(userId, tipo)
        : Promise.resolve(false),
      quiereNotif(ADMIN_USER_ID, tipo),
    ]);
    if (userId === ADMIN_USER_ID) {
      if (!quiereAdmin) return;
    } else if (!quiereAfiliado && !quiereAdmin) {
      return;
    }
    // El escalonado va AQUÍ, ya sabiendo que hay a quién avisar: antes se
    // esperaban hasta 52s para luego descubrir que nadie quería el aviso.
    if (tipo === "ftd") await esperarTurnoEnTanda();

    let nombre = "un afiliado";
    try {
      const { data } = await supabaseAdmin
        .from("affiliates")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.display_name) nombre = data.display_name;
    } catch {
      /* nombre por defecto */
    }

    // Lo que TÚ (admin) te llevas de este FTD: si es una cuenta propia
    // (Mongolitos) te llevas el importe entero; si es un afiliado normal, tu
    // margen = tu CPA − lo que le pagas a él (el `monto`).
    let montoAdmin: number | null = null;
    if (esFtd && quiereAdmin) {
      if (esCuentaPropia(userId)) {
        // Las cuentas propias tienen el CPA a 0 por diseño (no se les paga), así
        // que `monto` viene 0 y el aviso salía SIN cifra. Lo tuyo ahí es el CPA
        // del admin entero.
        const cpa = await adminCpa(isocountry);
        montoAdmin = monto && monto > 0 ? monto : cpa;
      } else if (hayMonto) {
        const cpa = await adminCpa(isocountry);
        if (cpa != null) {
          // ⚠️ Si el afiliado tiene PADRE, al padre se le paga un override sobre
          // su comisión, y eso sale de lo tuyo. Sin restarlo, el aviso decía más
          // dinero del que de verdad te queda (el panel sí lo resta).
          const override = await overrideDelPadre(userId, monto!);
          montoAdmin = cpa - monto! - override;
        }
      }
    }
    // "Te llevas 0 € 🤑" no se manda: mejor la frase genérica.
    if (montoAdmin != null && montoAdmin <= 0) montoAdmin = null;

    const tareas: Promise<void>[] = [];
    if (userId !== ADMIN_USER_ID) {
      if (quiereAfiliado) {
        tareas.push(
          enviarPush(userId, {
            title: esFtd ? "¡Nuevo FTD! 🎉" : "Nuevo registro 👀",
            body: esFtd
              ? hayMonto
                ? `Has ganado ${fmtMonto(monto!)} 🤑`
                : "Un jugador ha hecho su primer depósito con tu enlace."
              : "Alguien se ha registrado con tu enlace.",
            url: "/dashboard",
          })
        );
      }
      if (quiereAdmin) {
        tareas.push(
          enviarPush(ADMIN_USER_ID, {
            title: esFtd
              ? esBot
                ? botNombre
                  ? `🤖 FTD del bot de ${botNombre}`
                  : "🤖 FTD de un bot"
                : `💰 Nuevo FTD de ${nombre}`
              : esBot
                ? botNombre
                  ? `🤖 Registro del bot de ${botNombre}`
                  : "🤖 Registro de un bot"
                : `Nuevo registro de ${nombre}`,
            body: esFtd
              ? montoAdmin != null
                ? `${esBot ? "El bot lo ha traído. " : ""}Te llevas ${fmtMonto(montoAdmin)} 🤑`
                : esBot
                  ? "El bot ha generado un FTD."
                  : "Un afiliado ha generado un FTD."
              : esBot
                ? "El bot ha generado un registro."
                : "Un afiliado ha generado un registro.",
            // Al tocar el aviso de un FTD, al INICIO (no a Actividad).
          url: "/dashboard",
          })
        );
      }
    } else {
      // Tráfico propio del admin: un solo aviso.
      tareas.push(
        enviarPush(ADMIN_USER_ID, {
          title: esFtd ? "¡Nuevo FTD! 🎉" : "Nuevo registro 👀",
          body: esFtd
            ? hayMonto
              ? `Tu enlace ha generado ${fmtMonto(monto!)} 🤑`
              : "Tu enlace ha generado un FTD."
            : "Tu enlace ha generado un registro.",
          // Al tocar el aviso de un FTD, al INICIO (no a Actividad).
          url: "/dashboard",
        })
      );
    }
    // El aviso de depósito a Yaiza (con bot y FTD/recarga) va aparte, desde el
    // postback (avisarDepositoBotYaiza), para poder etiquetarlo bien.

    await Promise.all(tareas);
  } catch {
    /* nunca romper */
  }
}

// Nombre "de cara" de cada bot según su afp (para los avisos de Yaiza).
const BOT_NOMBRE: Record<string, string> = {
  bot: "A&S",
  botmn: "Jeffer",
  botdm: "Livana",
  botbk: "Black KP",
  botaf: "iAfrika",
};

// Aviso a Yaiza (gestora del bot) de un depósito por uno de los bots, diciendo
// de QUÉ bot es y si es un FTD NUEVO (primer depósito) o una RECARGA. Gateado por
// su preferencia "cuando depositan". Blindado: nunca rompe el postback.
export async function avisarDepositoBotYaiza(
  afp: string,
  tipo: "ftd" | "recarga"
): Promise<void> {
  try {
    if (!afp || !afp.startsWith("bot")) return;
    if (!(await quiereNotif(YAIZA_ID, "bot_deposito"))) return;
    const bot = BOT_NOMBRE[afp] ?? "un bot";
    const esFtd = tipo === "ftd";
    await enviarPush(YAIZA_ID, {
      title: esFtd ? `🎉 FTD nuevo · bot de ${bot}` : `🔁 Recarga · bot de ${bot}`,
      body: esFtd
        ? `Un jugador ha hecho su PRIMER depósito por el bot de ${bot}. Entra a verlo.`
        : `Un jugador ha vuelto a depositar (recarga) por el bot de ${bot}.`,
      url: "/dashboard/bot",
      tag: "bot-dep",
    });
  } catch {
    /* nunca romper */
  }
}
