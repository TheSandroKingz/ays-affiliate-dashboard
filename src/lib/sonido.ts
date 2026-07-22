// Sonidos cortos sintetizados (sin ficheros externos) para avisar de un QFTD.
// Se puede elegir el tono o silenciarlo, guardado por dispositivo en localStorage.

export type TonoNotif =
  | "off"
  | "caja"
  | "campana"
  | "moneda"
  | "arpa"
  | "gota"
  | "ping"
  | "tada";
const KEY = "sonidoNotif";

export const TONOS: { id: TonoNotif; label: string }[] = [
  { id: "off", label: "Silencio" },
  { id: "caja", label: "Caja (cha-ching)" },
  { id: "campana", label: "Campana" },
  { id: "moneda", label: "Moneda" },
  { id: "arpa", label: "Arpa (celestial)" },
  { id: "gota", label: "Gota (agua)" },
  { id: "ping", label: "Ping (limpio)" },
  { id: "tada", label: "Tada (logro)" },
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
    if (t === "caja") {
      // Dos notas brillantes ascendentes tipo caja registradora.
      nota(ac, 988, 0, 0.12, 0.22, "square");
      nota(ac, 1319, 0.09, 0.22, 0.2, "square");
    } else if (t === "campana") {
      nota(ac, 1175, 0, 0.6, 0.22, "sine");
      nota(ac, 2350, 0, 0.5, 0.08, "sine");
    } else if (t === "moneda") {
      nota(ac, 1760, 0, 0.08, 0.2, "square");
      nota(ac, 2637, 0.06, 0.18, 0.18, "square");
    } else if (t === "arpa") {
      // Arpegio suave ascendente (celestial), sine con decaída larga.
      [659, 784, 988, 1319].forEach((f, i) =>
        nota(ac, f, i * 0.06, 0.5, 0.16, "sine")
      );
    } else if (t === "gota") {
      // Gota de agua: blip que cae de agudo a grave.
      nota(ac, 1500, 0, 0.08, 0.18, "sine");
      nota(ac, 700, 0.05, 0.16, 0.2, "sine");
    } else if (t === "ping") {
      // Ping limpio con un armónico suave.
      nota(ac, 1400, 0, 0.55, 0.2, "sine");
      nota(ac, 2800, 0, 0.35, 0.05, "sine");
    } else if (t === "tada") {
      // "Ta-daa": nota corta y luego acorde de logro.
      nota(ac, 784, 0, 0.1, 0.18, "triangle");
      nota(ac, 1047, 0.13, 0.45, 0.2, "triangle");
      nota(ac, 659, 0.13, 0.45, 0.12, "triangle");
    }
  } catch {
    /* nada */
  }
}
