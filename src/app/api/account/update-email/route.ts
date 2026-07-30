import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { estaBloqueado, registrarFallo, limpiarFallos } from "@/lib/lockout";

export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const newEmail = body.newEmail;
  const currentPassword = body.currentPassword;

  // Validación de formato de email en el servidor.
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(newEmail))) {
    return NextResponse.json({ error: "Correo no válido" }, { status: 400 });
  }

  // RE-AUTENTICACIÓN: exigimos la contraseña ACTUAL antes de cambiar el correo.
  // Sin esto, un token robado bastaría para cambiar el email y luego resetear la
  // contraseña = toma de cuenta total. Verificamos con un cliente anónimo.
  if (!currentPassword || !user.email) {
    return NextResponse.json(
      { error: "Falta la contraseña actual" },
      { status: 400 }
    );
  }
  // Anti fuerza-bruta: sin esto, un token robado permitiría probar la contraseña
  // sin límite aquí (saltándose el bloqueo del login) y tomar la cuenta.
  const claveLock = `reauth:${user.id}`;
  if (await estaBloqueado(claveLock)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: pwErr } = await authClient.auth.signInWithPassword({
    email: user.email,
    password: String(currentPassword),
  });
  if (pwErr) {
    await registrarFallo(claveLock);
    return NextResponse.json(
      { error: "Contraseña actual incorrecta" },
      { status: 401 }
    );
  }
  await limpiarFallos(claveLock);

  // Siempre sobre la PROPIA cuenta del token (ignoramos cualquier userId del body).
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    email: newEmail,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
