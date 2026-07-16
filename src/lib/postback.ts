import { supabaseAdmin } from "./supabaseAdmin";

// Identificador único del jugador que manda freshbet. Probamos varios nombres
// de macro habituales para no depender de uno concreto. Sirve para NO contar
// dos veces el mismo evento (p. ej. si freshbet reintenta el postback).
export function getPlayerId(url: URL): string {
  const names = [
    "playerid",
    "player_id",
    "customerid",
    "customer_id",
    "subid",
    "sub_id",
    "txid",
    "transactionid",
    "userid",
    "clientid",
  ];
  for (const n of names) {
    const v = url.searchParams.get(n);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

// Intenta "reclamar" el evento (idempotencia). Devuelve true si se debe CONTAR
// (es nuevo, o no hay id, o la tabla no existe todavía), false si es un
// duplicado ya contado. IMPORTANTE: solo llamar cuando el evento SÍ se va a
// contar (dentro de la rama con afiliado emparejado), y si el conteo posterior
// falla, llamar a `liberarEvento` para que un reintento pueda volver a intentarlo.
export async function reclamarEvento(eventKey: string | null): Promise<boolean> {
  if (!eventKey) return true;
  const { data, error } = await supabaseAdmin
    .from("postback_dedup")
    .upsert({ event_key: eventKey }, { onConflict: "event_key", ignoreDuplicates: true })
    .select();
  if (error) return true; // tabla ausente u otro fallo: contamos igual (no perdemos eventos)
  return Array.isArray(data) && data.length > 0; // fila nueva = contar; vacío = duplicado
}

// Libera un evento reclamado (borra el token) para que un reintento lo cuente.
// Se usa si el incremento falló tras reclamar.
export async function liberarEvento(eventKey: string | null): Promise<void> {
  if (!eventKey) return;
  await supabaseAdmin
    .from("postback_dedup")
    .delete()
    .eq("event_key", eventKey)
    .then(() => {}, () => {});
}
