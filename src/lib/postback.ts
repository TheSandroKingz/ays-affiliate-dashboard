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
//  - counted    : se contó y (si aplica) se pagó el CPA
//  - duplicate  : ya se había contado (mismo player_id) → ignorado
//  - no_match   : no se pudo atribuir a ningún afiliado
//  - error      : se reclamó pero el incremento en BD falló (se liberó)
//  - held       : sospechoso (el jugador YA tenía un FTD contado y el candado no
//                 lo frenó) → NO se cuenta; queda retenido para revisión manual
//  - discarded  : un retenido que el admin descartó (no se cuenta)
export type EstadoEvento =
  | "counted"
  | "duplicate"
  | "no_match"
  | "error"
  | "held"
  | "discarded"
  | "resolved" // FTD retenido aprobado a mano por el admin (dinero sí sumado)
  | "deposit"; // primer depósito recibido, aún NO cualificado (no suma dinero)

// ¿Este jugador YA tiene un FTD CONTADO? Salvaguarda extra anti-doble-pago,
// independiente del candado `postback_dedup`: si por lo que sea el candado no
// frenó un reenvío (p. ej. la tabla de candados no estaba disponible), esto
// evita sumar el dinero dos veces. Ante la duda (fallo de lectura) devuelve
// false: el candado sigue siendo la protección principal y no queremos perder
// FTD legítimos. BLINDADO.
export async function ftdYaContado(playerId: string): Promise<boolean> {
  if (!playerId) return false;
  try {
    const { count, error } = await supabaseAdmin
      .from("postback_events")
      .select("id", { count: "exact", head: true })
      .in("event_type", ["ftd", "commission"]) // FTD antiguos + QFTD (commission)
      .eq("counted", true)
      .eq("player_id", playerId);
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

// ¿Existe un DEPÓSITO (postback de FTD) previo de este jugador? Un QFTD real
// SIEMPRE viene precedido del depósito. Si no hay depósito, la comisión es ruido
// de pruebas (jugador inventado) y NO debe contar. Ante fallo devuelve false
// (no contamos: preferimos retener que colar un falso). BLINDADO.
export async function depositoPrevio(playerId: string): Promise<boolean> {
  if (!playerId) return false;
  try {
    const { count, error } = await supabaseAdmin
      .from("postback_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "ftd")
      .eq("player_id", playerId);
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

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
