"use client";

import { useState } from "react";
import { validarMiembros, colorDe, type Miembro } from "@/lib/repartoGastos";

// Editor del reparto de gastos de un equipo (quiénes son y qué % le toca a cada
// uno). Lo usan la página de Gastos del afiliado y su ficha en el panel del admin.
export default function RepartoEditor({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: Miembro[];
  onGuardar: (miembros: Miembro[]) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [filas, setFilas] = useState<{ nombre: string; pct: string }[]>(
    inicial.length ? inicial.map((m) => ({ nombre: m.nombre, pct: String(m.pct).replace(".", ",") })) : [{ nombre: "", pct: "50" }, { nombre: "", pct: "50" }]
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cell =
    "rounded-md bg-white/10 border border-white/15 text-white text-base sm:text-sm px-2 py-1.5 [color-scheme:dark] placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
  const suma = filas.reduce((s, f) => s + (Number(f.pct.replace(",", ".")) || 0), 0);

  async function guardar(lista: { nombre: string; pct: string }[]) {
    setError(null);
    const v = validarMiembros(lista.map((f) => ({ nombre: f.nombre, pct: f.pct })));
    if ("error" in v) { setError(v.error); return; }
    setGuardando(true);
    try {
      const e = await onGuardar(v.miembros);
      if (e) setError(e);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
      <p className="text-sm text-slate-300">Reparto de gastos del equipo: quiénes sois y qué % le toca poner a cada uno.</p>
      {filas.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.nombre ? colorDe(f.nombre) : "#475569" }} />
          <input value={f.nombre} maxLength={30} placeholder="Nombre" onChange={(e) => setFilas((s) => s.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} className={`${cell} flex-1 min-w-0`} />
          <input value={f.pct} inputMode="decimal" placeholder="%" onChange={(e) => setFilas((s) => s.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} className={`${cell} w-20 text-right`} />
          <span className="text-slate-500 text-sm">%</span>
          {filas.length > 2 && (
            <button onClick={() => setFilas((s) => s.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400 px-2 min-h-[44px]" title="Quitar">×</button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setFilas((s) => (s.length < 8 ? [...s, { nombre: "", pct: "" }] : s))} className="text-sm text-emerald-400 hover:text-emerald-300">+ Añadir persona</button>
        <span className={`text-xs tabular-nums ${Math.abs(suma - 100) <= 0.05 ? "text-slate-400" : "text-amber-300"}`}>Suma: {suma.toLocaleString("es-ES")} %</span>
      </div>
      {error && <p className="text-sm text-amber-300">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => guardar(filas)} disabled={guardando} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2">{guardando ? "Guardando…" : "Guardar reparto"}</button>
        <button onClick={onCancelar} className="rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm px-4 py-2">Cancelar</button>
        {inicial.length > 0 && (
          <button onClick={() => guardar([])} disabled={guardando} className="ml-auto text-xs text-slate-400 hover:text-red-300">Quitar reparto (trabaja solo)</button>
        )}
      </div>
    </div>
  );
}
