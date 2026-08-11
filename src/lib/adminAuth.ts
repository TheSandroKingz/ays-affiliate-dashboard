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
