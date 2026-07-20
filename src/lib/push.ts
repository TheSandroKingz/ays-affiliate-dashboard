import webpush from "web-push";
import { supabaseAdmin } from "./supabaseAdmin";
import { ADMIN_USER_ID } from "./adminAuth";

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

// Notifica un evento contado (registro o FTD): avisa al afiliado a su móvil y
// también al admin. Si el evento es del propio admin (su tráfico), solo al
// admin. BLINDADO.
export async function notificarEvento(
  userId: string | null | undefined,
  tipo: "ftd" | "registration"
): Promise<void> {
  if (!userId) return;
  const esFtd = tipo === "ftd";
  try {
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

    const tareas: Promise<void>[] = [];
    if (userId !== ADMIN_USER_ID) {
      // Aviso para el afiliado.
      tareas.push(
        enviarPush(userId, {
          title: esFtd ? "¡Nuevo FTD! 🎉" : "Nuevo registro 👀",
          body: esFtd
            ? "Un jugador ha hecho su primer depósito con tu enlace."
            : "Alguien se ha registrado con tu enlace.",
          url: "/dashboard",
        })
      );
      // Aviso para el admin.
      tareas.push(
        enviarPush(ADMIN_USER_ID, {
          title: esFtd ? `💰 Nuevo FTD de ${nombre}` : `Nuevo registro de ${nombre}`,
          body: esFtd
            ? "Un afiliado ha generado un FTD."
            : "Un afiliado ha generado un registro.",
          url: "/admin/actividad",
        })
      );
    } else {
      // Tráfico propio del admin: un solo aviso.
      tareas.push(
        enviarPush(ADMIN_USER_ID, {
          title: esFtd ? "¡Nuevo FTD! 🎉" : "Nuevo registro 👀",
          body: esFtd
            ? "Tu enlace ha generado un FTD."
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
