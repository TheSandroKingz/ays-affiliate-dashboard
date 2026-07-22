import webpush from "web-push";
import { supabaseAdmin } from "./supabaseAdmin";
import { ADMIN_USER_ID } from "./adminAuth";
import { esCuentaPropia } from "./adminId";

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

type TipoNotif = "ftd" | "registration";

// ¿El usuario quiere que le avisen de este tipo de evento? Lee sus preferencias.
// Por defecto (o si la columna aún no existe): ambos activados.
async function quiereNotif(userId: string, tipo: TipoNotif): Promise<boolean> {
  const col = tipo === "ftd" ? "notif_ftd" : "notif_registro";
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

// CPA de España del admin (para calcular tu margen por un FTD de un afiliado).
// Blindado: null si no se puede leer (entonces el aviso va sin importe).
async function adminCpaSpain(): Promise<number | null> {
  try {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("cpa_spain")
      .eq("user_id", ADMIN_USER_ID)
      .maybeSingle();
    const v = Number(data?.cpa_spain);
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
  monto?: number
): Promise<void> {
  if (!userId) return;
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
        const cpa = await adminCpaSpain();
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
            title: esFtd ? `💰 Nuevo FTD de ${nombre}` : `Nuevo registro de ${nombre}`,
            body: esFtd
              ? montoAdmin != null
                ? `Te llevas ${fmtMonto(montoAdmin)} 🤑`
                : "Un afiliado ha generado un FTD."
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
    await Promise.all(tareas);
  } catch {
    /* nunca romper */
  }
}
