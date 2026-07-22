// Logros del afiliado, estilo Twitch: cada uno tiene una META y un progreso.
// Variados: hitos, rachas, días redondos, conversión, constancia y tráfico.

export type LogroStats = {
  totalFtd: number;
  totalRegistros: number;
  totalClicks: number;
  maxRacha: number; // días seguidos con FTD (máx histórico)
  mejorMes: number; // más FTD en un mes natural
  mejorDia: number; // más FTD en un mismo día
  diasConFtd: number; // nº de días distintos con algún FTD
  mesesConFtd: number; // nº de meses distintos con algún FTD
  conversion: number; // % FTD por clic
};

export type Logro = {
  id: string;
  emoji: string;
  nombre: string;
  desc: string;
  meta: number;
  sufijo?: string; // p. ej. "%" para conversión
  valor: (s: LogroStats) => number;
};

export const LOGROS: Logro[] = [
  // Primeros pasos
  { id: "primer-registro", emoji: "🌱", nombre: "El comienzo", desc: "Tu primer registro", meta: 1, valor: (s) => s.totalRegistros },
  { id: "primer-ftd", emoji: "🥇", nombre: "Estreno", desc: "Tu primer FTD", meta: 1, valor: (s) => s.totalFtd },
  // Hitos de FTD (tier)
  { id: "10-ftd", emoji: "🏅", nombre: "Veterano", desc: "Acumula 10 FTD", meta: 10, valor: (s) => s.totalFtd },
  { id: "50-ftd", emoji: "💎", nombre: "Diamante", desc: "Acumula 50 FTD", meta: 50, valor: (s) => s.totalFtd },
  { id: "100-ftd", emoji: "👑", nombre: "Leyenda", desc: "Acumula 100 FTD", meta: 100, valor: (s) => s.totalFtd },
  // Rachas
  { id: "racha-3", emoji: "🔥", nombre: "En racha", desc: "3 días seguidos con FTD", meta: 3, valor: (s) => s.maxRacha },
  { id: "racha-7", emoji: "🚀", nombre: "Imparable", desc: "7 días seguidos con FTD", meta: 7, valor: (s) => s.maxRacha },
  // Días redondos
  { id: "dia-3", emoji: "💥", nombre: "Día redondo", desc: "3 FTD en un mismo día", meta: 3, valor: (s) => s.mejorDia },
  { id: "dia-5", emoji: "⚡", nombre: "Explosión", desc: "5 FTD en un mismo día", meta: 5, valor: (s) => s.mejorDia },
  // Mes fuerte
  { id: "mes-10", emoji: "🌟", nombre: "Mes de oro", desc: "10 FTD en un mismo mes", meta: 10, valor: (s) => s.mejorMes },
  // Tráfico
  { id: "clicks-500", emoji: "🧲", nombre: "Imán de tráfico", desc: "500 clics acumulados", meta: 500, valor: (s) => s.totalClicks },
  // Calidad
  { id: "conv-5", emoji: "🎣", nombre: "Francotirador", desc: "5% de conversión (FTD/clics)", meta: 5, sufijo: "%", valor: (s) => Math.round(s.conversion * 10) / 10 },
  // Constancia
  { id: "dias-10", emoji: "📅", nombre: "Constante", desc: "Consigue FTD en 10 días distintos", meta: 10, valor: (s) => s.diasConFtd },
  { id: "meses-3", emoji: "🗓️", nombre: "Fiel", desc: "Consigue FTD en 3 meses distintos", meta: 3, valor: (s) => s.mesesConFtd },
];

// Progreso de un logro (0..100 %) y si está conseguido.
export function progresoLogro(l: Logro, s: LogroStats) {
  const bruto = l.valor(s);
  const v = Math.min(bruto, l.meta);
  const pct = l.meta > 0 ? Math.round((v / l.meta) * 100) : 0;
  return { valor: v, meta: l.meta, pct, hecho: bruto >= l.meta, sufijo: l.sufijo ?? "" };
}

type Fila = { date: string; ftd: number; registrations?: number; clicks?: number };

export function calcularStatsLogros(filas: Fila[]): LogroStats {
  let totalFtd = 0;
  let totalRegistros = 0;
  let totalClicks = 0;
  let mejorDia = 0;
  const porMes = new Map<string, number>();
  const diasConFtd: string[] = [];

  for (const r of filas) {
    const f = Number(r.ftd ?? 0);
    totalFtd += f;
    totalRegistros += Number(r.registrations ?? 0);
    totalClicks += Number(r.clicks ?? 0);
    if (f > mejorDia) mejorDia = f;
    const k = String(r.date).slice(0, 7);
    porMes.set(k, (porMes.get(k) ?? 0) + f);
    if (f > 0) diasConFtd.push(String(r.date).slice(0, 10));
  }

  // Racha máxima de días consecutivos con FTD.
  diasConFtd.sort();
  let maxRacha = 0;
  let actual = 0;
  let anterior: number | null = null;
  for (const iso of diasConFtd) {
    const t = new Date(iso + "T00:00:00Z").getTime();
    actual = anterior !== null && t - anterior === 86400000 ? actual + 1 : 1;
    anterior = t;
    if (actual > maxRacha) maxRacha = actual;
  }

  const mejorMes = porMes.size ? Math.max(...porMes.values()) : 0;
  const mesesConFtd = [...porMes.entries()].filter(([, n]) => n > 0).length;
  const conversion = totalClicks > 0 ? (totalFtd / totalClicks) * 100 : 0;

  return {
    totalFtd,
    totalRegistros,
    totalClicks,
    maxRacha,
    mejorMes,
    mejorDia,
    diasConFtd: diasConFtd.length,
    mesesConFtd,
    conversion,
  };
}
