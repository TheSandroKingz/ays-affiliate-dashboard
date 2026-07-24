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

  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint, p256dh, auth },
      { onConflict: "endpoint" }
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
