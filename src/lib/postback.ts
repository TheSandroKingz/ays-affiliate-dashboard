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
      // Normaliza importes con separadores de miles: quita todo lo que no sea
      // dígito ni separador, elimina los separadores de miles (el último ',' o
      // '.' es el decimal) y parsea. Así "1,234.56" y "1.234,56" → 1234.56.
      let s = raw.trim().replace(/[^\d.,]/g, "");
      const ultimoSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
      if (ultimoSep >= 0) {
        const ent = s.slice(0, ultimoSep).replace(/[.,]/g, "");
        const dec = s.slice(ultimoSep + 1).replace(/[.,]/g, "");
        s = `${ent}.${dec}`;
      }
      const v = Number(s);
      if (Number.isFinite(v) && v > 0) return v;
    }
  }
  return 0;
}

// Parsea un importe que PUEDE ser negativo (comisión / reversión) con separadores
// de miles robustos, CONSERVANDO el signo. A diferencia de getMonto (solo positivos
// > 0, para stats), aquí el signo es CRÍTICO: una comisión negativa = chargeback y
// dispara la reversión. Antes se hacía replace(",", ".") (solo la 1ª coma), así que
// "-1,234.56" salía NaN y la reversión NO se aplicaba → el afiliado se quedaba el
// dinero que FreshBet quitó. Devuelve NaN si no hay número.
export function montoConSigno(raw: string | null): number {
  if (!raw) return NaN;
  const neg = raw.includes("-") || raw.includes("−"); // signo (incluye el menos unicode)
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return NaN;
  const ultimoSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (ultimoSep >= 0) {
    const ent = s.slice(0, ultimoSep).replace(/[.,]/g, "");
    const dec = s.slice(ultimoSep + 1).replace(/[.,]/g, "");
    s = `${ent}.${dec}`;
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return NaN;
  return neg ? -v : v;
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
  | "deposit" // primer depósito recibido, aún NO cualificado (no suma dinero)
  | "qualified" // Blue marcó el FTD como cualificado, pero AÚN no paga comisión (no suma dinero; el CPA se cuenta con commission_paid)
  | "reversed"; // el casino (Celsius) quitó la comisión → se restó también al afiliado

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

// Busca el QFTD/FTD ya CONTADO de un jugador (para revertirlo si FreshBet quita
// la comisión). Devuelve al afiliado, cuánto se le acreditó y en qué fecha, o
// null si no hay nada contado. BLINDADO.
export async function buscarQftdContado(
  playerId: string
): Promise<{ id: number; userId: string; commission: number; date: string; afp: string | null } | null> {
  if (!playerId) return null;
  try {
    const { data } = await supabaseAdmin
      .from("postback_events")
      .select("id, matched_user_id, commission, created_at, counted_date, afp")
      .in("event_type", ["ftd", "commission"])
      .eq("counted", true)
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || !data.matched_user_id) return null;
    // Mes de conteo real: counted_date si existe (p. ej. FTD aprobado a mano en
    // otra fecha); si no, se deriva de created_at (histórico).
    const cd = (data as { counted_date?: string | null }).counted_date;
    const date = cd
      ? String(cd).slice(0, 10)
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid",
        }).format(new Date(data.created_at as string));
    return {
      id: data.id as number,
      userId: data.matched_user_id as string,
      commission: Number(data.commission ?? 0),
      date,
      afp: (data.afp as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export type EventoPostback = {
  event_type: "registration" | "ftd" | "commission" | "redeposit";
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
  // Columnas base SIEMPRE presentes. `amount` (importe del depósito) va aquí porque
  // NUNCA debe perderse: es un dato de dinero. `counted_date` es OPCIONAL (puede que
  // su migración no esté aplicada), así que va aparte y es lo PRIMERO que se descarta
  // si el insert falla — antes se descartaba amount por error y se perdía el importe.
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
    amount: e.amount ?? null,
    status: e.status,
  };
  // Fecha REAL de conteo (Madrid): fija el mes en el que restar si luego se revierte.
  const countedDate =
    e.status === "counted"
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date())
      : null;
  // ⚠️ Los reintentos SOLO se disparan si el error es por una COLUMNA que no existe
  // (migración sin aplicar). NUNCA ante un error cualquiera: un "commit-then-timeout"
  // devuelve error pero la fila SÍ se guardó, y reintentar a ciegas crearía una fila
  // DUPLICADA que infla el importe depositado y la media (aunque NO el pago del CPA,
  // que va aparte con su candado). Mejor una fila perdida en un fallo raro que un duplicado.
  const faltaColumna = (
    err: { code?: string; message?: string } | null,
    col: string
  ): boolean => {
    if (!err) return false;
    const code = err.code || "";
    const msg = (err.message || "").toLowerCase();
    // 42703 = columna inexistente (Postgres); PGRST204 = fuera de la caché de esquema.
    return code === "42703" || code === "PGRST204" || msg.includes(col.toLowerCase());
  };
  try {
    // 1) Completo (con counted_date).
    let { error } = await supabaseAdmin
      .from("postback_events")
      .insert({ ...base, counted_date: countedDate });
    // 2) Solo si FALTA la columna counted_date → reintenta sin ella (MANTIENE amount).
    if (faltaColumna(error, "counted_date")) {
      ({ error } = await supabaseAdmin.from("postback_events").insert(base));
    }
    // 3) Solo si FALTA la columna amount → último recurso sin ella (no perder el log).
    if (faltaColumna(error, "amount")) {
      const sinAmount = { ...base };
      delete (sinAmount as { amount?: unknown }).amount;
      await supabaseAdmin.from("postback_events").insert(sinAmount);
    }
  } catch {
    // Un fallo del log NUNCA debe romper el postback.
  }
}

// Depósito medio de un afiliado (calidad de tráfico): media del importe de sus
// primeros depósitos con importe > 0. Devuelve media=null si no hay datos.
// OJO: los eventos "ftd" se guardan con status "deposit" (counted=false), así que
// NO se puede exigir counted=true (eso los excluía a todos y salía siempre vacío,
// era el supuesto viejo de que "el casino no manda importe"; Celsius sí lo manda).
// BLINDADO.
export async function depositoMedio(
  userId: string
): Promise<{ media: number | null; num: number }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("postback_events")
      .select("amount")
      .eq("matched_user_id", userId)
      .eq("event_type", "ftd")
      .not("amount", "is", null)
      .gt("amount", 0)
      .limit(100000); // sin límite PostgREST corta en 1000 y la media saldría sesgada
    if (error || !data || !data.length) return { media: null, num: 0 };
    const sum = data.reduce((s, d) => s + Number(d.amount ?? 0), 0);
    return { media: sum / data.length, num: data.length };
  } catch {
    return { media: null, num: 0 };
  }
}

// Depósito medio GLOBAL (de TODOS los afiliados): media del importe de todos los
// primeros depósitos con importe > 0. Para el panel del admin. BLINDADO.
export async function depositoMedioGlobal(): Promise<{ media: number | null; num: number }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("postback_events")
      .select("amount")
      .eq("event_type", "ftd")
      .not("amount", "is", null)
      .gt("amount", 0)
      .limit(100000);
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
