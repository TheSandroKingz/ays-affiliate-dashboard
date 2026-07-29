import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { enviarPush } from "@/lib/push";

// Envía una notificación de PRUEBA al propio usuario (a todos sus dispositivos)
// para comprobar de un vistazo que las push funcionan y que su móvil sigue
// suscrito. Devuelve cuántos dispositivos tiene suscritos: si es 0, hay que
// volver a activar las notificaciones en el móvil.
export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // ¿Cuántos dispositivos suscritos tiene? (para saber si el móvil está enganchado)
  const { count } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const subs = count ?? 0;

  if (subs > 0) {
    await enviarPush(user.id, {
      title: "🔔 Prueba de notificación",
      body: "¡Funciona! Si ves esto, tus avisos están bien configurados.",
      url: "/dashboard",
    });
  }

  return NextResponse.json({ ok: true, subs });
}
