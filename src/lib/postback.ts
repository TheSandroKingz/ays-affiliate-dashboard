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

// Estado con el que se cerró un postback:
//  - counted   : se contó y (si aplica) se pagó el CPA
//  - duplicate : ya se había contado (mismo player_id) → ignorado
//  - no_match  : no se pudo atribuir a ningún afiliado
//  - error     : se reclamó pero el incremento en BD falló (se liberó)
export type EstadoEvento = "counted" | "duplicate" | "no_match" | "error";

export type EventoPostback = {
  event_type: "registration" | "ftd" | "commission";
  raw_query: string;
  tracking_code?: string;
  afp?: string;
  player_id?: string;
  isocountry?: string;
  matched_user_id: string | null;
  commission?: number;
  status: EstadoEvento;
};

// Registro de auditoría: guarda CADA postback recibido (crudo + resultado) en
// `postback_events`. Es la caja negra del dinero: permite verificar qué manda
// freshbet (p. ej. si trae player_id), revisar cuadres y detectar fraude.
// BLINDADO: cualquier fallo aquí se ignora; NUNCA debe romper el postback.
export async function registrarEvento(e: EventoPostback): Promise<void> {
  await supabaseAdmin
    .from("postback_events")
    .insert({
      event_type: e.event_type,
      raw_query: e.raw_query,
      tracking_code: e.tracking_code || null,
      afp: e.afp || null,
      player_id: e.player_id || null,
      isocountry: e.isocountry || null,
      matched_user_id: e.matched_user_id,
      commission: e.commission ?? null,
      counted: e.status === "counted",
      status: e.status,
    })
    .then(() => {}, () => {});
}

// Quita el secreto (?key=) de la query cruda antes de guardarla en el log.
export function queryLimpia(url: URL): string {
  const p = new URLSearchParams(url.search);
  p.delete("key");
  return p.toString();
}
