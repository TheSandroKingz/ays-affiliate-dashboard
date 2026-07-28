import crypto from "node:crypto";

// Compara un valor recibido con un secreto en TIEMPO CONSTANTE (no revela por el
// tiempo de respuesta cuántos caracteres acierta un atacante). Devuelve false si
// el secreto no está configurado o las longitudes no coinciden.
export function compararSecreto(
  recibido: string | null | undefined,
  esperado: string | undefined
): boolean {
  if (!esperado || typeof recibido !== "string") return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
