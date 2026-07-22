import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

// Login en el SERVIDOR. Resuelve usuario→email AQUÍ (nunca se devuelve el email
// al navegador, así nadie puede sonsacar el correo de otro adivinando su
// usuario) y valida la contraseña con un cliente anónimo efímero. Devuelve solo
// los tokens de sesión. Ante cualquier fallo, error GENÉRICO: no se distingue
// "usuario no existe" de "contraseña incorrecta" (no se puede enumerar).
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(`login:${ip}`, 20, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  const { identifier, password } = await request
    .json()
    .catch(() => ({ identifier: null, password: null }));

  if (!identifier || !password) {
    return NextResponse.json(
      { error: "Falta el usuario o la contraseña" },
      { status: 400 }
    );
  }

  const generico = () =>
    NextResponse.json(
      { error: "Usuario o contraseña incorrectos" },
      { status: 401 }
    );

  // Resolver el email (en servidor, nunca se devuelve).
  const id = String(identifier).trim();
  let email: string | null = null;
  if (id.includes("@")) {
    email = id;
  } else {
    // .limit(1) (no maybeSingle): si por caja de mayúsculas el ilike emparejara
    // varias filas, tomamos una en vez de petar (maybeSingle da error con >1).
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
  if (!email) return generico();

  // Cliente anónimo efímero (valida la contraseña; no persiste sesión).
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) return generico();

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}
