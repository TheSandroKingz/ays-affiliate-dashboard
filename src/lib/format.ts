// Formato de dinero unificado para toda la app.
// Máximo 2 decimales (evita "4,333 €"); sin forzar decimales en importes
// enteros ("50 €" en vez de "50,00 €"). Separador español (de-DE).
export function eur(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return (
    "€" +
    (Number.isFinite(v) ? v : 0).toLocaleString("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  );
}
