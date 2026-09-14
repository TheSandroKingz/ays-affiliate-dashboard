import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";

// Guarda (o actualiza) la suscripción de notificaciones push del dispositivo
// del usuario que ha iniciado sesión. La llama el navegador al activar las
// notificaciones. Cada endpoint es único; si ya existe, se reasigna al usuario.
export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const sub = body?.subscription ?? body;
  const endpoint: string | undefined = sub?.endpoint;
  const p256dh: string | undefined = sub?.keys?.p256dh;
  const auth: string | undefined = sub?.keys?.auth;
  const previousEndpoint: string | undefined = body?.previousEndpoint;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
  }

  // iPhone rota el endpoint: borramos el ANTERIOR de este mismo dispositivo (si
  // lo hay) para no dejar suscripciones fantasma que aceptan pero no entregan.
  // Solo toca las de ESTE usuario, así que no afecta al otro dispositivo.
  if (previousEndpoint && previousEndpoint !== endpoint) {
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", previousEndpoint)
      .then(
        () => {},
        () => {}
      );
  }

  // Seguridad: si este endpoint ya está registrado a OTRO usuario, no lo
  // reasignamos (evita que alguien que conozca un endpoint ajeno secuestre las
  // notificaciones de otro). Solo se puede crear el propio o refrescar el suyo.
  const { data: existente } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (existente && existente.user_id !== user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // `last_seen_at` marca la última vez que ESTE dispositivo dio señales de vida
  // (la app lo refresca cada 6 h). Sirve para distinguir un móvil real de una
  // suscripción FANTASMA: iPhone rota el endpoint y deja el viejo colgado, y
  // Apple sigue aceptándolo (201) aunque no lo entregue a nadie. Sin esto no
  // hay forma de saber cuál de las tres suscripciones de un usuario está viva.
  const fila = {
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    last_seen_at: new Date().toISOString(),
  };
  let { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert(fila, { onConflict: "endpoint" });
  // Si la columna aún no existe en la base (SQL sin aplicar), se guarda igual
  // sin ella: nadie se queda sin avisos por esto.
  if (error?.code === "42703" || /last_seen_at/.test(error?.message ?? "")) {
    ({ error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        { user_id: user.id, endpoint, p256dh, auth },
        { onConflict: "endpoint" }
      ));
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
