// Logros (trofeos) del afiliado. Se muestran todos en Cuenta → Logros; los no
// conseguidos salen apagados (oscuros) y los conseguidos con color y brillo.

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
  cond: (s: LogroStats) => boolean;
};

export const LOGROS: Logro[] = [
  { id: "primer-registro", emoji: "🌱", nombre: "El comienzo", desc: "Tu primer registro", cond: (s) => s.totalRegistros >= 1 },
  { id: "primer-ftd", emoji: "🥇", nombre: "Primer FTD", desc: "Consigue tu primer FTD", cond: (s) => s.totalFtd >= 1 },
  { id: "5-ftd", emoji: "🎯", nombre: "Cogiendo ritmo", desc: "Acumula 5 FTD", cond: (s) => s.totalFtd >= 5 },
  { id: "10-ftd", emoji: "🏅", nombre: "Veterano", desc: "Acumula 10 FTD", cond: (s) => s.totalFtd >= 10 },
  { id: "25-ftd", emoji: "⭐", nombre: "Estrella", desc: "Acumula 25 FTD", cond: (s) => s.totalFtd >= 25 },
  { id: "50-ftd", emoji: "💎", nombre: "Diamante", desc: "Acumula 50 FTD", cond: (s) => s.totalFtd >= 50 },
  { id: "100-ftd", emoji: "👑", nombre: "Leyenda", desc: "Acumula 100 FTD", cond: (s) => s.totalFtd >= 100 },
  { id: "racha-3", emoji: "🔥", nombre: "En racha", desc: "3 días seguidos con FTD", cond: (s) => s.maxRacha >= 3 },
  { id: "racha-7", emoji: "🚀", nombre: "Imparable", desc: "7 días seguidos con FTD", cond: (s) => s.maxRacha >= 7 },
  { id: "mes-10", emoji: "🌟", nombre: "Gran mes", desc: "10 FTD en un mismo mes", cond: (s) => s.mejorMes >= 10 },
];

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

  // Racha máxima: recorremos las fechas con FTD ordenadas y contamos runs de
  // días consecutivos.
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
