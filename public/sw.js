/* Service worker de A&S Afiliados.
   Su única función es recibir notificaciones push y mostrarlas, y abrir la app
   al tocarlas. No cachea nada (para no servir versiones viejas de la web). */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "A&S Afiliados", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "A&S Afiliados";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/dashboard" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

/* El iPhone (y Android) cambian el "endpoint" de las notificaciones cada cierto
   tiempo. Cuando pasa, el viejo deja de entregar aunque Apple lo siga aceptando
   con un 201, y hasta ahora el nuevo no se guardaba hasta que el usuario ABRÍA
   la app: en ese hueco no le llegaba ningún aviso y no había forma de saberlo.
   Este evento salta SIN la app abierta, así que re-registramos al momento. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const vieja = event.oldSubscription || null;
      const oldEndpoint = vieja && vieja.endpoint;
      if (!oldEndpoint) return; // sin el anterior no podemos probar quiénes somos

      // La suscripción nueva puede venir ya hecha; si no, la creamos con la
      // misma clave del servidor (la de la vieja, o pedida a la web).
      let nueva = event.newSubscription || null;
      if (!nueva) {
        let key = vieja.options && vieja.options.applicationServerKey;
        if (!key) {
          try {
            const r = await fetch("/api/push/key");
            const j = await r.json();
            key = j && j.key ? base64ToUint8(j.key) : null;
          } catch (e) {
            key = null;
          }
        }
        if (!key) return;
        try {
          nueva = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
        } catch (e) {
          return;
        }
      }

      try {
        await fetch("/api/push/rotate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldEndpoint, subscription: nueva.toJSON() }),
        });
      } catch (e) {
        /* si falla, al abrir la app se vuelve a registrar igual */
      }
    })()
  );
});

function base64ToUint8(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
