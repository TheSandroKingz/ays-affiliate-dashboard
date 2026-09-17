import { supabaseAdmin } from "./supabaseAdmin";

// Apunta lo que ha costado de verdad una llamada a la IA, con los números que
// devuelve Anthropic en cada respuesta (tokens nuevos, leídos de caché, escritos
// en caché y generados). Existe porque el 15-sep la factura se disparó y no
// había forma de saber qué parte era la respuesta, cuál las regeneraciones y
// cuál el revisor: solo se podía estimar, y las estimaciones salían 5 veces
// por debajo de lo que cobraba la consola.
// BLINDADO: no espera, no lanza, y si la tabla no existe no pasa nada.
type Uso = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function apuntarUso(
  tipo: string,
  res: { model?: string; usage?: Uso } | null | undefined,
  bot?: string | null
): void {
  try {
    const u = res?.usage;
    if (!u) return;
    void supabaseAdmin
      .from("ia_uso")
      .insert({
        tipo,
        bot: bot ?? null,
        modelo: res?.model ?? null,
        entrada: u.input_tokens ?? 0,
        cache_lee: u.cache_read_input_tokens ?? 0,
        cache_escribe: u.cache_creation_input_tokens ?? 0,
        salida: u.output_tokens ?? 0,
      })
      .then(
        () => {},
        () => {}
      );
  } catch {
    /* nunca romper una respuesta por apuntar el coste */
  }
}

// Apunta que un bot se quedó SIN respuesta de la IA y por qué (error de la
// llamada, respuesta vacía, freno de gasto). El 15-sep un jugador listo para
// depositar se quedó sin contestar y no había forma de saber el motivo.
// BLINDADO igual que apuntarUso: no espera, no lanza, sin tabla no hace nada.
// Qué pasó de verdad en cada apunte de ia_fallos. Yaiza (17-sep): el panel decía
// "sin contestar 90" cuando a la mitad SÍ se les había contestado (con el mensaje
// de emergencia). Un apunte aquí no es siempre "se quedó sin respuesta":
//   · frenado   → los topes de gasto cortaron la IA. A propósito y no se manda nada.
//   · silencio  → se silenció a alguien (es una ACCIÓN, no un fallo).
//   · acuse     → la IA falló, pero al jugador SÍ le llegó un mensaje corto.
//   · sinNada   → la IA falló y al jugador no le llegó nada. Esto es lo grave.
export type TipoFallo = "frenado" | "silencio" | "acuse" | "sinNada";
export function tipoDeFallo(motivo: string | null | undefined): TipoFallo {
  const m = (motivo ?? "").toLowerCase();
  if (m.startsWith("silenciado")) return "silencio";
  if (m.includes("tope diario") || m.includes("frenado por los topes")) return "frenado";
  if (m.includes("se mandó el acuse") || m.includes("mensaje de emergencia")) return "acuse";
  return "sinNada";
}

export function apuntarFallo(
  bot: string,
  chatId: number | string | null | undefined,
  motivo: string
): void {
  try {
    void supabaseAdmin
      .from("ia_fallos")
      .insert({
        bot,
        chat_id: chatId == null ? null : Number(chatId),
        motivo: motivo.slice(0, 500),
      })
      .then(
        () => {},
        () => {}
      );
  } catch {
    /* nunca romper una respuesta por apuntar un fallo */
  }
}
