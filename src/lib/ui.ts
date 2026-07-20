// Pequeñas utilidades de presentación.

// Fecha en cristiano: "hace un momento", "hace 5 min", "hace 2 h", "hace 3 d",
// y para más de una semana la fecha corta.
export function tiempoRelativo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 0) return "ahora";
  if (s < 45) return "hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
}

// Color estable derivado de un texto (para avatares sin foto).
const COLORES = [
  "#10b981",
  "#9333ea",
  "#f59e0b",
  "#38bdf8",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];
export function colorDeNombre(name: string | null | undefined): string {
  const s = name ?? "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORES[h % COLORES.length];
}

// Hoy en zona de Madrid, formato YYYY-MM-DD (para resaltar la fila de hoy).
export function hoyMadridISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(
    new Date()
  );
}
