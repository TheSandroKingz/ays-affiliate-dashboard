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
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
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
export async function reactivarSiConcedido(): Promise<void> {
  if (!pushSoportado() || !VAPID) return;
  if (Notification.permission !== "granted") return;
  try {
    await activarPush();
  } catch {
    /* silencioso */
  }
}
