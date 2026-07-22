import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

// Recuperar contraseña en el SERVIDOR. Resuelve usuario→email aquí (nunca se
// devuelve) y dispara el email de reseteo. SIEMPRE responde igual (ok genérico),
// exista o no la cuenta: así no se puede enumerar quién tiene cuenta.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(`recover:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  const { identifier } = await request
    .json()
    .catch(() => ({ identifier: null }));

  // Respuesta genérica (no revela si existe). Se devuelve pase lo que pase.
  const ok = NextResponse.json({ ok: true });
  if (!identifier) return ok;

  const id = String(identifier).trim();
  let email: string | null = null;
  if (id.includes("@")) {
    email = id;
  } else {
    // .limit(1) (no maybeSingle): si por caja de mayúsculas el ilike emparejara
    // varias filas, tomamos una en vez de petar (igual que en /api/login).
    const { data: affs } = await supabaseAdmin
      .from("affiliates")
      .select("user_id")
      .ilike("display_name", id.replace(/[%_]/g, "\\$&"))
      .limit(1);
    const affUserId = affs?.[0]?.user_id;
    if (affUserId) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(affUserId);
      email = u?.user?.email ?? null;
    }
  }
  if (!email) return ok; // no existe → mismo mensaje, sin filtrar

  try {
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    // La cabecera Origin (que pone el navegador) es el dominio PÚBLICO real; el
    // origin de request.url puede ser el host interno tras el proxy de Vercel,
    // y el enlace del email apuntaría a un dominio equivocado.
    const origin =
      request.headers.get("origin") || new URL(request.url).origin;
    await authClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });
  } catch {
    /* da igual: respuesta genérica de todos modos */
  }
  return ok;
}
