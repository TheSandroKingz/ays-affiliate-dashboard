import { supabaseAdmin } from "./supabaseAdmin";
import { ADMIN_USER_ID, esGestorBot } from "./adminId";

export { ADMIN_USER_ID };

// Igual que getAdminUser pero permite también a los GESTORES del bot (p. ej.
// Yaiza), que pueden LEER las conversaciones del bot. Para endpoints de lectura
// del bot; las acciones sensibles siguen usando getAdminUser.
export async function getGestorBot(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  if (!esGestorBot(data.user.id)) return null;

  // ⛔ Y que siga estando de alta. Antes esto no se miraba: desactivar a un
  // gestor (Yaiza) en el panel NO le quitaba el acceso a las conversaciones de
  // los 5 bots, a los nombres de los jugadores ni a la lista negra. Seguía
  // entrando con su sesión hasta que se borrara su usuario a mano.
  // El admin nunca se bloquea a sí mismo, pase lo que pase con la consulta.
  if (data.user.id !== ADMIN_USER_ID) {
    const { data: aff, error: qErr } = await supabaseAdmin
      .from("affiliates")
      .select("approved, active")
      .eq("user_id", data.user.id)
      .maybeSingle();
    // Si la consulta falla no cerramos la puerta a un gestor legítimo por un
    // hipo de la base de datos; pero si la fila dice que está de baja, fuera.
    if (!qErr && aff && (aff.approved !== true || aff.active === false)) return null;
  }
  return data.user;
}

export async function getAdminUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  if (data.user.id !== ADMIN_USER_ID) return null;

  return data.user;
}
