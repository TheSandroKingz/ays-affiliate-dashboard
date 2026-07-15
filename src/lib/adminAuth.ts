import { supabaseAdmin } from "./supabaseAdmin";
import { ADMIN_USER_ID } from "./adminId";

export { ADMIN_USER_ID };

export async function getAdminUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  if (data.user.id !== ADMIN_USER_ID) return null;

  return data.user;
}
