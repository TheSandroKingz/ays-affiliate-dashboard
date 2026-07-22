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
  // Hitos de FTD (de novato a ballena)
  { id: "ftd-1", emoji: "🥇", nombre: "Estreno", desc: "Tu primer FTD", meta: 1, valor: (s) => s.totalFtd },
  { id: "ftd-50", emoji: "🎯", nombre: "Arrancando", desc: "Acumula 50 FTD", meta: 50, valor: (s) => s.totalFtd },
  { id: "ftd-250", emoji: "🏅", nombre: "Veterano", desc: "Acumula 250 FTD", meta: 250, valor: (s) => s.totalFtd },
  { id: "ftd-1000", emoji: "💎", nombre: "Diamante", desc: "Acumula 1.000 FTD", meta: 1000, valor: (s) => s.totalFtd },
  { id: "ftd-2500", emoji: "👑", nombre: "Leyenda", desc: "Acumula 2.500 FTD", meta: 2500, valor: (s) => s.totalFtd },
  { id: "ftd-5000", emoji: "🐋", nombre: "Ballena", desc: "Acumula 5.000 FTD", meta: 5000, valor: (s) => s.totalFtd },
  // Rachas
  { id: "racha-7", emoji: "🔥", nombre: "En racha", desc: "7 días seguidos con FTD", meta: 7, valor: (s) => s.maxRacha },
  { id: "racha-30", emoji: "🚀", nombre: "Imparable", desc: "30 días seguidos con FTD", meta: 30, valor: (s) => s.maxRacha },
  // Días top
  { id: "dia-25", emoji: "💥", nombre: "Día top", desc: "25 FTD en un mismo día", meta: 25, valor: (s) => s.mejorDia },
  { id: "dia-50", emoji: "⚡", nombre: "Día histórico", desc: "50 FTD en un mismo día", meta: 50, valor: (s) => s.mejorDia },
  // Mes fuerte
  { id: "mes-250", emoji: "🌟", nombre: "Mes de oro", desc: "250 FTD en un mismo mes", meta: 250, valor: (s) => s.mejorMes },
  { id: "mes-500", emoji: "🏆", nombre: "Mes récord", desc: "500 FTD en un mismo mes", meta: 500, valor: (s) => s.mejorMes },
  // Tráfico
  { id: "clicks-10k", emoji: "🧲", nombre: "Imán de tráfico", desc: "10.000 clics acumulados", meta: 10000, valor: (s) => s.totalClicks },
  { id: "clicks-50k", emoji: "📡", nombre: "Viral", desc: "50.000 clics acumulados", meta: 50000, valor: (s) => s.totalClicks },
  // Calidad
  { id: "conv-25", emoji: "🎣", nombre: "Francotirador", desc: "25% de conversión (FTD/clics)", meta: 25, sufijo: "%", valor: (s) => Math.round(s.conversion * 10) / 10 },
  { id: "conv-40", emoji: "🎯", nombre: "Élite", desc: "40% de conversión (FTD/clics)", meta: 40, sufijo: "%", valor: (s) => Math.round(s.conversion * 10) / 10 },
  // Reclutando
  { id: "reg-500", emoji: "👥", nombre: "Reclutador", desc: "500 registros", meta: 500, valor: (s) => s.totalRegistros },
  { id: "reg-2000", emoji: "📣", nombre: "Multitud", desc: "2.000 registros", meta: 2000, valor: (s) => s.totalRegistros },
  // Constancia
  { id: "dias-30", emoji: "📅", nombre: "Constante", desc: "FTD en 30 días distintos", meta: 30, valor: (s) => s.diasConFtd },
  { id: "meses-6", emoji: "🗓️", nombre: "Fiel", desc: "FTD en 6 meses distintos", meta: 6, valor: (s) => s.mesesConFtd },
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
