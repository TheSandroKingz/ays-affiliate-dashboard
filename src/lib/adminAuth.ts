import { supabaseAdmin } from "./supabaseAdmin";

export const ADMIN_USER_ID = "a38a91c3-1f25-42df-ad5b-fbef6c09fee0";

export async function getAdminUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  if (data.user.id !== ADMIN_USER_ID) return null;

  return data.user;
}
