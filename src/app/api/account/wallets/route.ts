import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";
import { estaBloqueado, registrarFallo, limpiarFallos } from "@/lib/lockout";

export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const erc = (body.walletErc20 ?? "").trim();
  const trc = (body.walletTrc20 ?? "").trim();
  const currentPassword = body.currentPassword;

  // RE-AUTENTICACIÓN: exigimos la contraseña ACTUAL antes de cambiar la billetera
  // de cobro. Sin esto, un token robado bastaría para desviar los pagos a la
  // dirección del atacante. Igual que en el cambio de correo.
  if (!currentPassword || !user.email) {
    return NextResponse.json(
      { error: "Falta la contraseña actual" },
      { status: 400 }
    );
  }
  // Anti fuerza-bruta: sin esto, un token robado permitiría probar la contraseña
  // sin límite AQUÍ (saltándose el bloqueo del login) y desviar los pagos.
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

  // Validación también en el servidor (no fiarse solo del cliente).
  if (erc && !/^0x[a-fA-F0-9]{40}$/.test(erc)) {
    return NextResponse.json(
      { error: "La billetera de Ethereum (ERC-20) no es válida." },
      { status: 400 }
    );
  }
  if (trc && !/^T[a-zA-Z0-9]{33}$/.test(trc)) {
    return NextResponse.json(
      { error: "La billetera de Tron (TRC-20) no es válida." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update({
      wallet_erc20: erc || null,
      wallet_trc20: trc || null,
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aviso al admin cuando alguien cambia su billetera (defensa extra: si fuera
  // un robo, te enteras). No retrasa la respuesta.
  after(() =>
    enviarPush(ADMIN_USER_ID, {
      title: "🔔 Billetera de cobro cambiada",
      body: "Un afiliado ha actualizado su billetera USDT. Revisa si no lo esperabas.",
      url: "/admin",
    })
  );

  return NextResponse.json({ ok: true });
}
