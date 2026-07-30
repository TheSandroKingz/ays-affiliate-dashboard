import { supabaseAdmin } from "./supabaseAdmin";

// Bloqueo anti fuerza-bruta POR CLAVE, compartido entre servidores. Reusa la
// misma tabla `login_intentos` + RPC `login_fallo` del login. Sirve para frenar
// el probado ilimitado de la contraseña en endpoints sensibles (cambiar la
// billetera de cobro, el correo…): sin esto, un token robado permitiría probar
// contraseñas sin tope y saltarse el bloqueo del login. BLINDADO: si la tabla/
// función aún no existe (SQL sin aplicar), NO bloquea (no rompe el flujo).
const LIMITE = 8;
const VENTANA_MS = 15 * 60 * 1000;

// ¿Está bloqueada esta clave (demasiados fallos recientes)?
export async function estaBloqueado(key: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("login_intentos")
      .select("fallos, primer")
      .eq("k", key)
      .maybeSingle();
    if (!data) return false;
    const dentroVentana =
      Date.now() - new Date(data.primer as string).getTime() < VENTANA_MS;
    return dentroVentana && (Number(data.fallos) || 0) >= LIMITE;
  } catch {
    return false;
  }
}

// Registra un intento fallido (atómico vía RPC).
export async function registrarFallo(key: string): Promise<void> {
  await supabaseAdmin
    .rpc("login_fallo", { p_key: key, p_ventana_ms: VENTANA_MS })
    .then(
      () => {},
      () => {}
    );
}

// Limpia el contador tras un intento correcto.
export async function limpiarFallos(key: string): Promise<void> {
  await supabaseAdmin
    .from("login_intentos")
    .delete()
    .eq("k", key)
    .then(
      () => {},
      () => {}
    );
}
