// Placeholder animado que imita la estructura del panel mientras cargan
// los datos. Da sensación de rapidez frente a un simple "Cargando...".
export default function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 pt-4 md:pt-0 animate-pulse">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-44 rounded bg-white/10" />
          <div className="h-4 w-56 rounded bg-white/10" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-64 max-w-full rounded-lg bg-white/10" />
          <div className="h-9 w-24 rounded-lg bg-white/10" />
        </div>
      </div>

      {/* Tarjeta de balance */}
      <div className="bg-white/10 border border-white/10 rounded-xl p-6 max-w-md">
        <div className="h-4 w-24 rounded bg-white/10 mb-3" />
        <div className="h-9 w-40 rounded bg-white/10 mb-3" />
        <div className="h-3 w-full rounded bg-white/10" />
      </div>

      {/* Tarjetas de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-white/10 border-t-4 border-t-white/10 bg-black/40"
          >
            <div className="h-3 w-16 rounded bg-white/10 mb-3" />
            <div className="h-6 w-20 rounded bg-white/10" />
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div className="bg-white/10 border border-white/10 rounded-xl p-6">
        <div className="h-[320px] w-full rounded-lg bg-white/5" />
      </div>
    </div>
  );
}
