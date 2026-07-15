// Placeholders animados reutilizables para los estados de carga.

export function TableSkeleton({
  title,
  cols = 3,
  rows = 6,
}: {
  title: string;
  cols?: number;
  rows?: number;
}) {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0 animate-pulse">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10">
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="border border-white/10 px-4 py-3">
                  <div className="h-3 w-20 rounded bg-white/10" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} className={r % 2 === 1 ? "bg-white/[0.03]" : ""}>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} className="border border-white/10 px-4 py-3">
                    <div className="h-4 w-full max-w-[110px] rounded bg-white/10" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export function CardsSkeleton({
  title,
  cards = 3,
}: {
  title: string;
  cards?: number;
}) {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl animate-pulse">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="bg-white/10 border border-white/20 rounded-xl p-6"
          >
            <div className="h-5 w-40 rounded bg-white/10 mb-4" />
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 w-40 rounded bg-white/10" />
              <div className="h-4 w-16 rounded bg-white/10" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="h-4 w-16 rounded bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
