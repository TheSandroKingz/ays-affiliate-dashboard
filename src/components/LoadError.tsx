"use client";

// Estado de error de carga: en vez de mostrar 0€ falsos o una pantalla vacía
// cuando falla la conexión, mostramos un aviso claro con botón de reintentar.
export default function LoadError({
  onRetry,
  titulo = "No se pudieron cargar los datos",
}: {
  onRetry: () => void;
  titulo?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-slate-300">{titulo}</p>
      <p className="text-slate-500 text-sm">
        Puede ser un fallo temporal de conexión. Vuelve a intentarlo.
      </p>
      <button
        onClick={onRetry}
        className="mt-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition"
      >
        Reintentar
      </button>
    </div>
  );
}
