// Sonidos cortos sintetizados (sin ficheros externos) para avisar de un QFTD.
// Se puede elegir el tono o silenciarlo, guardado por dispositivo en localStorage.

export type TonoNotif =
  | "off"
  | "venta"
  | "kaching"
  | "registradora"
  | "monedas"
  | "moneda"
  | "arpa";
const KEY = "sonidoNotif";

export const TONOS: { id: TonoNotif; label: string }[] = [
  { id: "off", label: "Silencio" },
  { id: "venta", label: "Venta (cha-ching)" },
  { id: "kaching", label: "Ka-ching brillante" },
  { id: "registradora", label: "Registradora" },
  { id: "monedas", label: "Monedas" },
  { id: "moneda", label: "Moneda" },
  { id: "arpa", label: "Arpa (celestial)" },
];

export function getTono(): TonoNotif {
  if (typeof window === "undefined") return "off";
  const v = localStorage.getItem(KEY) as TonoNotif | null;
  // Validamos por si quedó guardado un tono viejo ya eliminado.
  return v && TONOS.some((o) => o.id === v) ? v : "off";
}
export function setTono(t: TonoNotif) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* nada */
  }
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

// Una nota corta.
function nota(
  ac: AudioContext,
  freq: number,
  inicio: number,
  dur: number,
  vol = 0.22,
  tipo: OscillatorType = "triangle"
) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = tipo;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + inicio;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Reproduce el tono elegido (o el que se pase). Silencioso si "off" o sin audio.
export function reproducirSonido(tono?: TonoNotif) {
  const t = tono ?? getTono();
  if (t === "off") return;
  const ac = getCtx();
  if (!ac) return;
  try {
    if (ac.state === "suspended") ac.resume();
    if (t === "venta") {
      // "Cha-ching" de venta tipo Shopify: golpe corto + campanilla brillante.
      nota(ac, 784, 0, 0.09, 0.2, "square"); // "cha"
      nota(ac, 1568, 0.09, 0.4, 0.22, "triangle"); // "ching" brillante
      nota(ac, 2349, 0.09, 0.35, 0.1, "sine"); // chispa
    } else if (t === "kaching") {
      // Ka-ching con acorde brillante y chispa aguda.
      nota(ac, 587, 0, 0.08, 0.18, "square"); // "ka"
      nota(ac, 1319, 0.08, 0.45, 0.2, "triangle");
      nota(ac, 1760, 0.08, 0.4, 0.16, "triangle");
      nota(ac, 2637, 0.08, 0.3, 0.08, "sine"); // chispa
    } else if (t === "registradora") {
      // Dos campanillas de caja registradora (ding-ding) con armónico.
      nota(ac, 1568, 0, 0.28, 0.2, "sine");
      nota(ac, 3136, 0, 0.2, 0.06, "sine");
      nota(ac, 2093, 0.13, 0.35, 0.2, "sine");
      nota(ac, 4186, 0.13, 0.25, 0.05, "sine");
    } else if (t === "monedas") {
      // Cascada de monedas: varios blips brillantes seguidos.
      [1976, 2349, 1760, 2637, 2093].forEach((f, i) =>
        nota(ac, f, i * 0.05, 0.12, 0.16, "square")
      );
    } else if (t === "moneda") {
      nota(ac, 1760, 0, 0.08, 0.2, "square");
      nota(ac, 2637, 0.06, 0.18, 0.18, "square");
    } else if (t === "arpa") {
      // Arpegio suave ascendente (celestial), sine con decaída larga.
      [659, 784, 988, 1319].forEach((f, i) =>
        nota(ac, f, i * 0.06, 0.5, 0.16, "sine")
      );
    }
  } catch {
    /* nada */
  }
}
