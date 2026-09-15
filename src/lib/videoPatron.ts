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
