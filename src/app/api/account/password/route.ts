import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";
import { estaBloqueado, registrarFallo, limpiarFallos } from "@/lib/lockout";
import { validarPassword } from "@/lib/authErrors";

// Cambio de contraseña con RE-AUTENTICACIÓN (espejo de wallets/update-email).
// Exige la contraseña ACTUAL: sin esto, un access_token de sesión robado bastaría
// para fijar una contraseña nueva y quedarse con la cuenta (toma de cuenta total).
export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user || !user.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const currentPassword = body.currentPassword;
  const newPassword = String(body.newPassword ?? "");

  if (!currentPassword) {
    return NextResponse.json({ error: "Falta la contraseña actual" }, { status: 400 });
  }
  // Fuerza de la contraseña nueva validada EN EL SERVIDOR (no fiarse del cliente).
  const pwErr = validarPassword(newPassword);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  // Anti fuerza-bruta de la reautenticación (un token robado no puede probar
  // contraseñas sin límite aquí, saltándose el bloqueo del login).
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
  const { error: pwCheck } = await authClient.auth.signInWithPassword({
    email: user.email,
    password: String(currentPassword),
  });
  if (pwCheck) {
    await registrarFallo(claveLock);
    return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 401 });
  }
  await limpiarFallos(claveLock);

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aviso al admin (defensa extra: si fuera un robo, te enteras).
  after(() =>
    enviarPush(ADMIN_USER_ID, {
      title: "🔔 Contraseña cambiada",
      body: "Un afiliado ha cambiado su contraseña. Revisa si no lo esperabas.",
      url: "/admin",
    })
  );

  return NextResponse.json({ ok: true });
}
