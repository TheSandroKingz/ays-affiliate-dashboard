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

// Importe del depósito (para medir la calidad del tráfico). Probamos varios
// nombres de macro habituales. Devuelve 0 si freshbet no lo manda.
export function getMonto(url: URL): number {
  const names = [
    "amount",
    "depositamount",
    "deposit_amount",
    "ftdamount",
    "ftd_amount",
    "sumdep",
    "depsum",
    "value",
  ];
  for (const n of names) {
    const raw = url.searchParams.get(n);
    if (raw && raw.trim()) {
      const v = Number(raw.trim().replace(",", "."));
      if (Number.isFinite(v) && v > 0) return v;
    }
  }
  return 0;
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
  amount?: number; // importe del depósito (calidad de tráfico)
  status: EstadoEvento;
};

// Registro de auditoría: guarda CADA postback recibido (crudo + resultado) en
// `postback_events`. Es la caja negra del dinero: permite verificar qué manda
// freshbet (p. ej. si trae player_id), revisar cuadres y detectar fraude.
// BLINDADO: cualquier fallo aquí se ignora; NUNCA debe romper el postback.
export async function registrarEvento(e: EventoPostback): Promise<void> {
  const base = {
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
  };
  try {
    const { error } = await supabaseAdmin
      .from("postback_events")
      .insert({ ...base, amount: e.amount ?? null });
    // Por si la columna 'amount' aún no existe: reintenta sin ella.
    if (error) {
      await supabaseAdmin.from("postback_events").insert(base);
    }
  } catch {
    // Un fallo del log NUNCA debe romper el postback.
  }
}

// Depósito medio de un afiliado (calidad de tráfico): media del importe de sus
// FTD contados con importe > 0. Devuelve media=null si no hay datos (freshbet
// aún no manda el importe, o la columna no existe). BLINDADO.
export async function depositoMedio(
  userId: string
): Promise<{ media: number | null; num: number }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("postback_events")
      .select("amount")
      .eq("matched_user_id", userId)
      .eq("event_type", "ftd")
      .eq("counted", true)
      .not("amount", "is", null)
      .gt("amount", 0);
    if (error || !data || !data.length) return { media: null, num: 0 };
    const sum = data.reduce((s, d) => s + Number(d.amount ?? 0), 0);
    return { media: sum / data.length, num: data.length };
  } catch {
    return { media: null, num: 0 };
  }
}

// Quita el secreto (?key=) de la query cruda antes de guardarla en el log.
export function queryLimpia(url: URL): string {
  const p = new URLSearchParams(url.search);
  p.delete("key");
  return p.toString();
}
