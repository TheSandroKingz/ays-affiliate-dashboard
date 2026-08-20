// Límite de peticiones sencillo en memoria por clave (p. ej. IP + ruta).
// Frena ráfagas de fuerza bruta / enumeración / spam en los endpoints
// públicos. No sustituye a un WAF, pero añade una capa real de defensa.
import { supabaseAdmin } from "./supabaseAdmin";

type Entry = { count: number; reset: number };
const store = new Map<string, Entry>();

// Limpieza perezosa de entradas caducadas para no acumular memoria.
function limpiar(now: number) {
  if (store.size < 5000) return;
  for (const [k, v] of store) {
    if (now > v.reset) store.delete(k);
  }
}

/**
 * Devuelve true si la petición está permitida, false si supera el límite.
 * @param key    identificador (p. ej. `login:1.2.3.4`)
 * @param limit  nº máximo de peticiones por ventana
 * @param windowMs  tamaño de la ventana en milisegundos
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  limpiar(now);
  const entry = store.get(key);
  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

/**
 * Rate limit COMPARTIDO entre instancias (Vercel serverless): usa la BD para que
 * el contador NO se pierda en cold starts ni sea por-instancia (antes el tope real
 * se multiplicaba). Reutiliza el RPC atómico `login_fallo` (incrementa y devuelve
 * el nº de peticiones de la ventana). BLINDADO: si el RPC falla o el SQL no está,
 * cae al limitador en memoria — siempre queda algo de defensa, nunca rompe.
 * @returns true si se permite, false si supera el límite.
 */
export async function rateLimitShared(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("login_fallo", {
      p_key: `rl:${key}`,
      p_ventana_ms: windowMs,
    });
    if (error || typeof data !== "number") return rateLimit(key, limit, windowMs);
    return data <= limit; // data = peticiones en la ventana (incluida esta)
  } catch {
    return rateLimit(key, limit, windowMs);
  }
}

// Obtiene la IP del cliente. Preferimos `x-real-ip` (Vercel la pone con la IP
// verdadera, NO falsificable por el cliente); si no, caemos al x-forwarded-for.
export function getClientIp(request: Request): string {
  const real = request.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const xff = request.headers.get("x-forwarded-for");
  return xff?.split(",")[0].trim() || "unknown";
}
