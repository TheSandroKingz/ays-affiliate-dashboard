import { NextRequest, NextResponse } from "next/server";
import { getApprovedUser } from "@/lib/userAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Guarda campos de PERFIL del afiliado en el SERVIDOR (getApprovedUser + service
// role), para que el navegador NO escriba directo en `affiliates` con la anon key.
// Solo se aceptan campos de la WHITELIST: así, aunque los privilegios de columna
// en la BD fueran amplios, un afiliado NUNCA puede tocar approved, cpa_*,
// subaffiliate_percent, referred_by, etc. Las WALLETS NO están aquí: van por su
// propio endpoint con re-autenticación por contraseña.
const CAMPOS_TEXTO = new Set(["display_name", "first_name", "avatar_url", "birthdate"]);
const CAMPOS_BOOL = new Set([
  "notif_ftd",
  "notif_registro",
  "notif_bot_msg",
  "notif_bot_deposito",
]);

export async function POST(request: NextRequest) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const upd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((body ?? {}) as Record<string, unknown>)) {
    if (CAMPOS_BOOL.has(k)) {
      upd[k] = !!v;
    } else if (CAMPOS_TEXTO.has(k)) {
      const s = typeof v === "string" ? v.trim() : "";
      // Nombre: obligatorio no vacío, sin emojis y con tope de longitud.
      if (k === "display_name" || k === "first_name") {
        if (!s || s.length > 60 || /\p{Extended_Pictographic}/u.test(s)) continue;
      }
      // Fecha: solo formato AAAA-MM-DD (si no, se ignora).
      if (k === "birthdate" && s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) continue;
      upd[k] = s || null;
    }
    // Cualquier otra clave se ignora (no está en la whitelist).
  }
  if (!Object.keys(upd).length) return NextResponse.json({ ok: true });

  const escribir = () =>
    supabaseAdmin.from("affiliates").update(upd).eq("user_id", user.id);
  let { error } = await escribir();
  // Por si la columna 'birthdate' aún no existe: reintenta sin ella.
  if (error && "birthdate" in upd) {
    delete upd.birthdate;
    error = Object.keys(upd).length ? (await escribir()).error : null;
  }
  if (error) {
    // 23505 = nombre de usuario duplicado → 409 para dar un mensaje útil al cliente.
    return error.code === "23505"
      ? NextResponse.json({ error: "duplicate" }, { status: 409 })
      : NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
