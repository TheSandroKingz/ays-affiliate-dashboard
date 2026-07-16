// Límite de peticiones sencillo en memoria por clave (p. ej. IP + ruta).
// Frena ráfagas de fuerza bruta / enumeración / spam en los endpoints
// públicos. No sustituye a un WAF, pero añade una capa real de defensa.

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

// Obtiene la IP del cliente. Preferimos `x-real-ip` (Vercel la pone con la IP
// verdadera, NO falsificable por el cliente); si no, caemos al x-forwarded-for.
export function getClientIp(request: Request): string {
  const real = request.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const xff = request.headers.get("x-forwarded-for");
  return xff?.split(",")[0].trim() || "unknown";
}
