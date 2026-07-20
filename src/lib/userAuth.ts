import { supabaseAdmin } from "./supabaseAdmin";

// Valida el token del usuario Y exige que su cuenta esté APROBADA y ACTIVA.
// Devuelve el user si todo OK, o null (para responder 401/403). Así, aunque un
// pendiente o desactivado conserve un JWT válido, NO puede tocar nada por API.
export async function getApprovedUser(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  let aff: { approved?: boolean; active?: boolean } | null = null;
  let qErr: unknown = null;
  {
    const r = await supabaseAdmin
      .from("affiliates")
      .select("approved, active")
      .eq("user_id", data.user.id)
      .maybeSingle();
    aff = r.data;
    qErr = r.error;
    // Por si la columna 'active' aún no existe: reintenta sin ella.
    if (qErr) {
      const r2 = await supabaseAdmin
        .from("affiliates")
        .select("approved")
        .eq("user_id", data.user.id)
        .maybeSingle();
      aff = r2.data;
      qErr = r2.error;
    }
  }

  if (qErr) return null; // no pudimos verificar → denegar por seguridad
  if (!aff || aff.approved !== true) return null;
  if (aff.active === false) return null; // cuenta desactivada
  return data.user;
}
