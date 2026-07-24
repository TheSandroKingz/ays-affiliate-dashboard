// Utilidades de notificaciones push en el navegador (lado cliente).
// En iPhone las push SOLO funcionan si la web está instalada como app
// (Añadir a pantalla de inicio) con iOS 16.4+.

import { supabase } from "./supabaseClient";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function pushSoportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Registra el service worker (idempotente).
export async function registrarSW(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSoportado()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function authHeader(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  return { Authorization: "Bearer " + session.access_token };
}

// Suscribe este dispositivo y lo guarda en el servidor. Pide permiso si hace
// falta. Devuelve true si quedó activo.
export async function activarPush(): Promise<boolean> {
  if (!pushSoportado() || !VAPID) return false;
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return false;

  const reg = await registrarSW();
  if (!reg) return false;
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID) as unknown as BufferSource,
    });
  }

  const headers = await authHeader();
  if (!headers) return false;
  // iPhone rota el "endpoint" cada cierto tiempo y crea uno nuevo dejando el
  // viejo colgado (Apple lo acepta pero no lo entrega → ese móvil se pierde
  // avisos). Guardamos el último endpoint de ESTE dispositivo y le decimos al
  // servidor que borre el anterior, para que cada móvil tenga UNA sola
  // suscripción fresca (no fantasmas).
  let previousEndpoint: string | null = null;
  try {
    previousEndpoint = localStorage.getItem("lastPushEndpoint");
  } catch {
    /* nada */
  }
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      previousEndpoint:
        previousEndpoint && previousEndpoint !== sub.endpoint
          ? previousEndpoint
          : undefined,
    }),
  });
  if (res.ok) {
    try {
      localStorage.setItem("lastPushEndpoint", sub.endpoint);
    } catch {
      /* nada */
    }
  }
  return res.ok;
}

// Desactiva las notificaciones en este dispositivo.
export async function desactivarPush(): Promise<boolean> {
  if (!pushSoportado()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const headers = await authHeader();
      if (headers) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      await sub.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

// Si el permiso YA está concedido, se asegura de que la suscripción existe y
// está guardada en el servidor (por si cambió de sesión o dispositivo). Silencioso.
// Solo lo hace UNA vez por sesión del navegador (evita reenvíos en cada apertura).
export async function reactivarSiConcedido(): Promise<void> {
  if (!pushSoportado() || !VAPID) return;
  if (Notification.permission !== "granted") return;
  try {
    // Clave por USUARIO: si en la misma pestaña entra otra cuenta, se vuelve a
    // registrar su dispositivo (no se queda atado al usuario anterior).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    // Re-sincroniza al abrir la app si hace más de 6h de la última vez (en vez
    // de solo una vez por sesión): así, si iPhone rotó el endpoint, la
    // suscripción guardada se refresca y el móvil no deja de recibir avisos.
    const key = "pushSync:" + session.user.id;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 6 * 60 * 60 * 1000) return;
    await activarPush();
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* silencioso */
  }
}
