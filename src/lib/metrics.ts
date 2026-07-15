// Configuración de métricas del panel (clave, etiqueta y color).
// Compartida entre el dashboard y el gráfico.
export const metricConfig = [
  { key: "commission", label: "Comisión", color: "#10b981" },
  { key: "clicks", label: "Clics", color: "#9333ea" },
  { key: "registrations", label: "Registros", color: "#f59e0b" },
  { key: "ftd", label: "FTD", color: "#38bdf8" },
] as const;
