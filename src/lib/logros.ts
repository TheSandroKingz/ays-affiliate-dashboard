// Logros del afiliado, estilo Twitch: cada uno tiene una META y un progreso
// hacia ella, así se ve cuánto falta aunque no esté conseguido.

export type LogroStats = {
  totalFtd: number;
  totalRegistros: number;
  maxRacha: number; // racha máxima histórica de días seguidos con FTD
  mejorMes: number; // más FTD en un mes natural
};

export type Logro = {
  id: string;
  emoji: string;
  nombre: string;
  desc: string;
  meta: number; // objetivo a alcanzar
  valor: (s: LogroStats) => number; // progreso actual
};

export const LOGROS: Logro[] = [
  { id: "primer-registro", emoji: "🌱", nombre: "El comienzo", desc: "Consigue tu primer registro", meta: 1, valor: (s) => s.totalRegistros },
  { id: "primer-ftd", emoji: "🥇", nombre: "Primer FTD", desc: "Consigue tu primer FTD", meta: 1, valor: (s) => s.totalFtd },
  { id: "5-ftd", emoji: "🎯", nombre: "Cogiendo ritmo", desc: "Acumula 5 FTD", meta: 5, valor: (s) => s.totalFtd },
  { id: "10-ftd", emoji: "🏅", nombre: "Veterano", desc: "Acumula 10 FTD", meta: 10, valor: (s) => s.totalFtd },
  { id: "25-ftd", emoji: "⭐", nombre: "Estrella", desc: "Acumula 25 FTD", meta: 25, valor: (s) => s.totalFtd },
  { id: "50-ftd", emoji: "💎", nombre: "Diamante", desc: "Acumula 50 FTD", meta: 50, valor: (s) => s.totalFtd },
  { id: "100-ftd", emoji: "👑", nombre: "Leyenda", desc: "Acumula 100 FTD", meta: 100, valor: (s) => s.totalFtd },
  { id: "racha-3", emoji: "🔥", nombre: "En racha", desc: "3 días seguidos con FTD", meta: 3, valor: (s) => s.maxRacha },
  { id: "racha-7", emoji: "🚀", nombre: "Imparable", desc: "7 días seguidos con FTD", meta: 7, valor: (s) => s.maxRacha },
  { id: "mes-10", emoji: "🌟", nombre: "Gran mes", desc: "10 FTD en un mismo mes", meta: 10, valor: (s) => s.mejorMes },
];

// Progreso de un logro (0..1) y si está conseguido.
export function progresoLogro(l: Logro, s: LogroStats) {
  const v = Math.min(l.valor(s), l.meta);
  const pct = l.meta > 0 ? Math.round((v / l.meta) * 100) : 0;
  return { valor: v, meta: l.meta, pct, hecho: l.valor(s) >= l.meta };
}

type Fila = { date: string; ftd: number; registrations?: number };

// Calcula las estadísticas para los logros a partir de las filas diarias.
export function calcularStatsLogros(filas: Fila[]): LogroStats {
  let totalFtd = 0;
  let totalRegistros = 0;
  const porMes = new Map<string, number>();
  const diasConFtd: string[] = [];

  for (const r of filas) {
    const f = Number(r.ftd ?? 0);
    totalFtd += f;
    totalRegistros += Number(r.registrations ?? 0);
    const k = String(r.date).slice(0, 7);
    porMes.set(k, (porMes.get(k) ?? 0) + f);
    if (f > 0) diasConFtd.push(String(r.date).slice(0, 10));
  }

  diasConFtd.sort();
  let maxRacha = 0;
  let actual = 0;
  let anterior: number | null = null;
  for (const iso of diasConFtd) {
    const t = new Date(iso + "T00:00:00Z").getTime();
    if (anterior !== null && t - anterior === 86400000) {
      actual++;
    } else {
      actual = 1;
    }
    anterior = t;
    if (actual > maxRacha) maxRacha = actual;
  }

  const mejorMes = porMes.size ? Math.max(...porMes.values()) : 0;
  return { totalFtd, totalRegistros, maxRacha, mejorMes };
}
