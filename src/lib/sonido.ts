// Sonidos cortos sintetizados (sin ficheros externos) para avisar de un QFTD.
// Se puede elegir el tono o silenciarlo, guardado por dispositivo en localStorage.

export type TonoNotif = "off" | "caja" | "campana" | "moneda";
const KEY = "sonidoNotif";

export const TONOS: { id: TonoNotif; label: string }[] = [
  { id: "off", label: "Silencio" },
  { id: "caja", label: "Caja (cha-ching)" },
  { id: "campana", label: "Campana" },
  { id: "moneda", label: "Moneda" },
];

export function getTono(): TonoNotif {
  if (typeof window === "undefined") return "off";
  const v = localStorage.getItem(KEY) as TonoNotif | null;
  return v ?? "off";
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
    }
  } catch {
    /* nada */
  }
}
