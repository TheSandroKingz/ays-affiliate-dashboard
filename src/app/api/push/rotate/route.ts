import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Re-registro AUTOMÁTICO cuando el móvil cambia de endpoint.
//
// El iPhone rota el endpoint de las notificaciones cada cierto tiempo: el viejo
// deja de entregar (aunque Apple lo siga aceptando con un 201) y el nuevo no se
// guarda hasta que el usuario ABRE la app. En ese hueco no le llega nada, y si
// no abre el dashboard en unos días el hueco dura días. Eso es exactamente lo
// que pasó: tres suscripciones guardadas y solo la última viva.
//
// El navegador avisa del cambio con el evento `pushsubscriptionchange` en el
// service worker, que se dispara SIN la app abierta. Pero ahí no hay sesión
// iniciada, así que este endpoint no puede pedir token. La prueba de identidad
// es conocer el endpoint ANTERIOR: es una URL secreta que solo tenían ese
// dispositivo y nosotros. Con eso se reasigna la fila al mismo usuario.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const anterior: string | undefined = body?.oldEndpoint;
  const sub = body?.subscription;
  const endpoint: string | undefined = sub?.endpoint;
  const p256dh: string | undefined = sub?.keys?.p256dh;
  const auth: string | undefined = sub?.keys?.auth;
  if (!anterior || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  // El endpoint nuevo tiene que ser del MISMO servicio de push que el viejo
  // (Apple sigue con Apple, Google con Google). Sin esto, quien consiguiera un
  // endpoint ajeno podría desviar los avisos de otro a un servidor suyo.
  let mismoServicio = false;
  try {
    mismoServicio = new URL(anterior).host === new URL(endpoint).host;
  } catch {
    mismoServicio = false;
  }
  if (!mismoServicio) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Sin fila anterior no hay nada que probar: no se crea de la nada.
  const { data: vieja } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", anterior)
    .maybeSingle();
  if (!vieja) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Si el endpoint nuevo ya estuviera registrado a OTRO usuario, no se toca.
  const { data: existente } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (existente && existente.user_id !== vieja.user_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const fila = {
    user_id: vieja.user_id,
    endpoint,
    p256dh,
    auth,
    last_seen_at: new Date().toISOString(),
  };
  let { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert(fila, { onConflict: "endpoint" });
  // Si la columna last_seen_at aún no existe, se guarda igual sin ella.
  if (error?.code === "42703" || /last_seen_at/.test(error?.message ?? "")) {
    ({ error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        { user_id: vieja.user_id, endpoint, p256dh, auth },
        { onConflict: "endpoint" }
      ));
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // El viejo ya no entrega a nadie: fuera, para que no parezca que el aviso salió.
  if (anterior !== endpoint) {
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", anterior)
      .then(
        () => {},
        () => {}
      );
  }

  return NextResponse.json({ ok: true });
}
