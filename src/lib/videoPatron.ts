// ¿Se le puede mandar el vídeo del patrón? Detectores comunes a los 5 bots.
//
// REGLA 4 DE YAIZA: no reenviar el vídeo del patrón como respuesta a ningún
// mensaje salvo que el jugador lo pida explícitamente. El vídeo lo decide el
// CÓDIGO (no la IA), así que aquí es donde tiene que cumplirse.
//
// Caso real (15-sep, Ivan): "me salían las bombas aveces y me mataban haciendo
// exactamente lo mismo que tú" → le llegó el vídeo, y un segundo después escribió
// "Y he perdido 20 euros". El freno de quejas solo miraba "perdí", "no sirve",
// "estafa"… Revisados los 213 vídeos de 30 días: esta ampliación frena 17 más, y
// los 17 eran quejas o dudas.

// Quejas sobre el patrón que el freno viejo no pillaba: bombas o minas que le
// salen, caen o "le matan", "no me a funcionado" (sin h), "llevo 10 partidas y
// solo eh ganado 1", "mierds de truco"…
export const QUEJA_PATRON_RE = new RegExp(
  [
    String.raw`\b(sal[eií]\w*|ca[eí]\w*|toc\w*|pet\w*|explot\w*|mat\w*|revent\w*)\b[^.\n]{0,25}\b(bombas?|minas?)\b`,
    String.raw`\b(bombas?|minas?)\b[^.\n]{0,25}\b(me\s+)?(mat\w*|revent\w*|sal[eií]\w*|ca[eí]\w*|pet\w*|explot\w*|estaba|era|hab[ií]a)\b`,
    String.raw`\b(era|hab[ií]a|estaba|sal[ií]a|toc[oó]|ca[ií]a)\s+(una\s+|la\s+)?(puta\s+)?(mina|bomba)`,
    String.raw`no\s+(me\s+)?(ha|a|he|e)\s+funcionado`,
    String.raw`no\s+(me\s+)?(funcion[oó]|fue\s+bien|sali[oó]\s+bien)`,
    String.raw`no\s+falla(ba)?\s+nunca`,
    String.raw`\bmierd\w*`,
    String.raw`s[oó]lo\s+(eh|he|e|ha|a)\s+ganado`,
    String.raw`llevo\s+\d+\s+(partidas|rondas|intentos|tiradas|veces)`,
    String.raw`haciendo\s+(exactamente\s+)?(lo\s+mismo|igual)\s+que\s+t[uú]`,
  ].join("|"),
  "i"
);

// El jugador NO está pidiendo el vídeo: es él quien manda algo ("te mando video",
// "t mando", "te mande el video") o habla de un vídeo que ya recibió ("en el vídeo
// que has mandado", "seguí los pasos del vídeo"). Antes contaba como petición
// porque juntaba "mandar" + "vídeo": "Mira te mando video para que lo veas" se
// llevó el vídeo del patrón. En 30 días, 37 falsas peticiones así.
export const ENVIO_PROPIO_RE =
  /\b(te|t|os)\s+(voy\s+a\s+)?(mand|envi|env[ií]|pas)\w*|\b(he|hemos)\s+(mandado|enviado|pasado)\b|\b(me\s+)?(has|hab[eé]is|ha)\s+(mandado|enviado|pasado)\b|\bque\s+me\s+(mandaste|mandste|enviaste|pasaste)\b|\b(del|en\s+el|como\s+(en\s+)?el)\s+v[ií]deo\b|\bvi\s+(el|tu|un)\s+v[ií]deo\b|\bhay\s+un\s+v[ií]deo\s+tuyo\b|\bhacer\s+v[ií]deos\b|\[el jugador te ha enviado/i;

// ── REGLA 4 ESTRICTA (decisión del dueño, 15-sep) ──────────────────────────
// El vídeo SOLO sale si el jugador lo pide claramente, o si el bot le pregunta si
// lo quiere y dice que sí. Antes salía con que nombrara el patrón: en 30 días,
// 213 vídeos a 156 jugadores, pero peticiones claras solo hubo 10, y la mayoría de
// los envíos respondían a quejas ("el patrón ese me ha fallado varias veces").

// Petición clara: una forma de pedírselo AL BOT + vídeo/patrón/clip/ejemplo detrás.
export const PIDE_VIDEO_CLARO_RE =
  /\b(p[aá]same(lo|la)?|m[aá]ndame(lo|la)?|env[ií]ame(lo|la)?|reenv[ií]ame(lo|la)?|ens[eé][ñn]ame|mu[eé]strame|dame|ponme|me\s+(pasas|mandas|env[ií]as|ense[ñn]as|muestras|pones)|me\s+(puedes|podr[ií]as)\s+(pasar|mandar|enviar|ense[ñn]ar)|quiero\s+ver|puedo\s+ver)\b[^.\n?]{0,25}\b(v[ií]deo|patr[oó]n|clip|ejemplo)/i;

// El último mensaje del bot le ofreció el vídeo ("¿quieres que te pase el vídeo?").
// Incluye la oferta sin interrogación ("si necesitas el vídeo me dices"): el dueño
// pidió que si el bot pregunta si necesita el vídeo y dice que sí, se le mande.
export const OFRECE_VIDEO_RE =
  /(quieres|necesit\w*|te\s+hace\s+falta|te\s+(vendr[ií]a|viene)\s+bien|te\s+ayuda\w*|te\s+sirve|te\s+(lo\s+)?(paso|mando|env[ií]o)|pasarte|mandarte|enviarte)\b[^.\n]{0,30}\bv[ií]deo|\bv[ií]deo[^.\n]{0,20}\?/i;

// Respuesta corta de "sí" a esa oferta ("sí", "dale bro", "sí pásamelo", "vale porfa").
export const ACEPTA_RE =
  /^(?:(?:s[ií]+|sip|dale|vale|ok(?:ey)?|porfa(?:vor)?|por\s+favor|claro|venga|va|p[aá]samelo|m[aá]ndamelo|env[ií]amelo|bro|hermano|t[ií]o|g|manito|please|pls)[\s!.,👍🙏]*){1,4}$/i;

// ¿Acepta el vídeo que le acaba de ofrecer el bot? Solo mira el último mensaje del
// bot si lo que escribe el jugador es un "sí" corto (una consulta, y solo entonces).
export async function aceptaOfertaDeVideo(
  textoJugador: string,
  ultimoDelBot: () => Promise<string>
): Promise<boolean> {
  const t = (textoJugador || "").trim();
  if (!t || t.length > 40 || !ACEPTA_RE.test(t)) return false;
  try {
    return OFRECE_VIDEO_RE.test(await ultimoDelBot());
  } catch {
    return false;
  }
}

// LIVANA: sus recorridos SOLO existen en vídeo (no están escritos, a diferencia de
// la Z). Orden del dueño: si un jugador le pregunta cómo jugar, se le manda el
// vídeo. Así preguntan de verdad: "Y como juego", "Pero no se como se juega".
// Se descartan los mensajes largos (un texto de bienvenida del propio bot quedó
// guardado como del jugador: "así es como le doy yo") y las dudas de dinero,
// depósito o cuenta ("Como lo hago para meter dinero para usar el patron").
export const COMO_JUGAR_RE =
  /c[oó]mo\s+(se\s+)?(juega|jugar|juego|jueg[oa]s|lo\s+hago|lo\s+hac[eé]s|le\s+doy|le\s+das|hago\s+el\s+recorrido|es\s+el\s+recorrido|lo\s+juegas|tengo\s+que\s+jugar|debo\s+jugar)|qu[eé]\s+(recorrido|casillas|patr[oó]n)\s+(hago|toco|sigo|uso)|qu[eé]\s+(hago|tengo\s+que\s+hacer)\s+(ahora|ya|dentro)|y\s+ahora\s+qu[eé]\s+hago|d[oó]nde\s+(toco|pulso|clico)|en\s+qu[eé]\s+casillas/i;
const NO_ES_DE_JUGAR_RE = /dinero|deposit|ingres|registr|cuenta|retir|bono|pag/i;
export function preguntaComoJugar(texto: string): boolean {
  const t = (texto || "").trim();
  return t.length > 0 && t.length <= 120 && COMO_JUGAR_RE.test(t) && !NO_ES_DE_JUGAR_RE.test(t);
}
