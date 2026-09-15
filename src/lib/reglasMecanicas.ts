// COMPROBACIONES MECÁNICAS DE YAIZA QUE SE PUEDEN ASEGURAR CON CÓDIGO (15-sep).
// El resto las repasa el revisor (FILTRO_MECANICO en telegramAI). Estas van al
// final de todo, sobre el texto que ya va a salir, así que tapan también lo que
// haya corregido el revisor.
// Calibradas contra 4.622 respuestas reales de 14 días. Nunca tocan el formato
// (saltos de línea, listas numeradas): solo cambian o quitan lo que incumple.

// Quita las FRASES enteras que contienen la clave. Empieza justo después del final
// de la frase anterior (sin comérselo), así el texto que queda conserva su espacio:
// "hermano. <frase quitada>. Aquí estoy" → "hermano. Aquí estoy".
const quitarFrases = (clave: string) =>
  new RegExp(String.raw`(?<=^|[.!?\n])[ \t]*[^.!?\n]*(?:` + clave + String.raw`)[^.!?\n]*[.!?]?`, "gi");

// Regla 9: una sola pregunta por mensaje (salía en 181 de 4.622). Quedarse solo con
// una rompía mensajes ("Cómo así? Estás jugando igual, con 2 minas?" → "Cómo así?"),
// así que se JUNTAN en una: "Cómo así, estás jugando igual, con 2 minas?".
const NOMBRE_PROPIO = /^(Celsius|Sandro|Mines|Diamond|Instagram|TikTok|Telegram|Google|PayPal|Bizum|Paysafe\w*|USDT|BTC|SEPA|Visa|Mastercard|Jeffer|Livana|Z\b)/;
export function unaSolaPregunta(txt: string): string {
  if ((txt.match(/\?/g) || []).length < 2) return txt;
  // Las direcciones web pueden llevar "?": se apartan y se devuelven intactas.
  const urls: string[] = [];
  const oculto = txt.replace(/https?:\/\/\S+/g, (u) => {
    urls.push(u);
    return `@@URL${urls.length - 1}@@`;
  });
  let sobran = (oculto.match(/\?/g) || []).length - 1;
  const junto = oculto.replace(/\?([ \t]*)(\n?)([^\s]*)/g, (m, esp: string, salto: string, palabra: string) => {
    if (sobran <= 0) return m;
    sobran--;
    if (salto || !palabra) return "." + esp + salto + palabra;
    const siguiente =
      NOMBRE_PROPIO.test(palabra) || (palabra.length > 1 && palabra === palabra.toUpperCase())
        ? palabra
        : palabra.charAt(0).toLowerCase() + palabra.slice(1);
    return "," + (esp || " ") + siguiente;
  });
  return junto.replace(/@@URL(\d+)@@/g, (_m, i: string) => urls[Number(i)]);
}

// Regla 11: expresiones vetadas.
export function sinExpresionesVetadas(txt: string): string {
  return txt
    .replace(/\bel canguelo\b/gi, "los nervios")
    .replace(/\bcanguelo\b/gi, "nervios")
    .replace(/\bah,? pill[eé]\b/gi, "vale")
    .replace(/\blo pill[eé]\b/gi, "entendido");
}

// Regla 13: urgencia artificial (solo las frases de Yaiza; "date prisa, que tienes el
// temporizador del pago corriendo" es útil y no se toca).
const URGENCIA = quitarFrases(String.raw`solo por hoy|no dejes pasar (esto|esta oportunidad)|aprovecha ahora|[uú]ltima oportunidad`);
export const sinUrgencia = (txt: string) => txt.replace(URGENCIA, "").trim();

// Regla 16: números largos que pueden ser de tarjeta, cuenta o documento. No salió
// ninguno en 14 días; es un seguro.
export function sinNumerosSensibles(txt: string): string {
  return txt
    .replace(/\b[A-Z]{2}\d{2}(?:\s?\d{4}){4,7}\b/g, "****")
    .replace(/\b\d(?:[ -]?\d){11,18}\b/g, "****")
    .replace(/\b\d{8}[A-HJ-NP-TV-Z]\b/gi, "****");
}

// Regla 17: SOLO lo que NO está confirmado en Datos Fijos. El 024, el 112 y FEJAR SÍ
// están confirmados (para quien ha dicho que está en España y da una señal seria),
// así que el código no los toca: si están bien dados lo juzga el revisor.
export const INSTITUCION_NO_CONFIRMADA = /servicios sociales|ayuntamiento|cruz roja|c[aá]ritas|asuntos sociales|(\+\d{2,3}[\s.-]?)?\b[6-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/i;
const FRASE_17 = quitarFrases(String.raw`servicios sociales|ayuntamiento|cruz roja|c[aá]ritas|asuntos sociales|(\+\d{2,3}[\s-]?)?\b[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b`);
export const sinInstitucionesNoConfirmadas = (txt: string) => txt.replace(FRASE_17, "").trim();

// Regla 21: que hay una persona o un equipo leyendo. "Lo van a revisar" (el soporte
// de Celsius) es correcto y no se toca. A Yaiza, que prueba el bot, se la puede
// llamar por su nombre.
const FRASE_21 = quitarFrases(String.raw`\b(mi|nuestro) equipo\b|(te|le) paso con (una persona|alguien|un compa[ñn]ero)|lo va a revisar (alguien|una persona)|(una persona|alguien) (va a revisar|lo revisar[aá])`);
const FRASE_YAIZA = quitarFrases(String.raw`\byaiza\b`);
export function sinPersonaDetras(txt: string, nombreJugador?: string | null): string {
  let t = txt.replace(FRASE_21, "");
  if (!/yaiza/i.test(nombreJugador ?? "")) t = t.replace(FRASE_YAIZA, "");
  return t.trim();
}

// Regla 22: "Mándale una captura" pidiéndoselo AL JUGADOR → "Mándame". Solo ese caso:
// "escríbele al chat en vivo" o "diles que cancelen el bono" hablan del soporte y
// son correctos (27 de 29 casos reales eran así).
export function segundaPersona(txt: string): string {
  return txt.replace(
    /\b(m[aá]nd|env[ií]|p[aá]s)(ale|ALE)\b(?=\s+(?:la|el|una|un|esa|esta)\s+(?:captura|foto|imagen|pantallazo|v[ií]deo))/gi,
    (m: string, raiz: string, fin: string, off: number, todo: string) => {
      const alrededor = todo.slice(Math.max(0, off - 80), off + 80);
      if (/soporte|celsius|chat en vivo|ellos|amig|colega|a (él|ella)/i.test(alrededor)) return m;
      return raiz + (fin === "ALE" ? "AME" : "ame");
    }
  );
}

export function aplicarReglasMecanicas(txt: string, nombreJugador?: string | null): string {
  if (!txt) return txt;
  let t = txt;
  t = sinExpresionesVetadas(t);
  t = sinNumerosSensibles(t);
  t = segundaPersona(t);
  t = unaSolaPregunta(t);
  const recortado = sinPersonaDetras(sinInstitucionesNoConfirmadas(sinUrgencia(t)), nombreJugador);
  // Si al quitar frases no queda casi nada, mejor el texto sin recortar que un mensaje vacío.
  return recortado.length >= 8 ? recortado : t;
}
