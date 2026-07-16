import { supabaseAdmin } from "./supabaseAdmin";

// Valida el token del usuario Y exige que su cuenta esté APROBADA.
// Devuelve el user si todo OK, o null (para responder 401/403).
// Así, aunque un pendiente conserve un JWT válido, NO puede tocar nada por API.
export async function getApprovedUser(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("approved")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!aff || aff.approved !== true) return null;
  return data.user;
}
