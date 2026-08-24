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
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body
          );
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode;
          // Suscripción caducada o revocada: la borramos para no reintentar.
          if (code === 404 || code === 410) {
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
export async function notificarEvento(
  userId: string | null | undefined,
  tipo: TipoNotif,
  monto?: number,
  afp = "",
  isocountry?: string
): Promise<void> {
  if (!userId) return;
  const esBot = !!afp && afp.startsWith("bot");
  const botNombre = BOT_NOMBRE[afp] ?? "el bot";
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
    if (hayMonto && quiereAdmin) {
      if (esCuentaPropia(userId)) {
        montoAdmin = monto!;
      } else {
        const cpa = await adminCpa(isocountry);
        montoAdmin = cpa != null ? Math.max(0, cpa - monto!) : null;
      }
    }

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
                ? `🤖 FTD del bot de ${botNombre}`
                : `💰 Nuevo FTD de ${nombre}`
              : esBot
                ? `🤖 Registro del bot de ${botNombre}`
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
            url: "/admin/actividad",
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
          url: "/admin/actividad",
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
