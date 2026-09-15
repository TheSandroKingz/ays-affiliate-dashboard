"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";

type Gasto = { id: number; fecha: string; concepto: string; importe: number };

const cell =
  "w-full rounded-md bg-white/10 border border-white/15 text-white text-sm px-2 py-2 min-h-[44px] placeholder:text-slate-500 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500";
const th = "px-4 py-3 text-xs font-medium text-slate-400 whitespace-nowrap";
const hoyMadrid = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

export default function GastosAfiliadoPage() {
  const [periodo, setPeriodo] = useState(hoyMadrid().slice(0, 7));
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [ganado, setGanado] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [noActivo, setNoActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyMadrid());
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Este mes, los 11 anteriores y "Todo".
  const opciones = useMemo(() => {
    const [y, m] = hoyMadrid().split("-").map(Number);
    const out: { value: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const value = d.toISOString().slice(0, 7);
      const nombre = d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
      out.push({ value, label: i === 0 ? "Este mes" : nombre.charAt(0).toUpperCase() + nombre.slice(1) });
    }
    out.push({ value: "todo", label: "Todo" });
    return out;
  }, []);

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch(`/api/account/gastos?mes=${periodo}`, { headers: { Authorization: "Bearer " + t } });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setError(b?.error || "No se pudieron cargar tus gastos."); return; }
      setNoActivo(!!b.tablaFalta);
      setGastos(b.gastos ?? []);
      setGanado(Number(b.ganado ?? 0));
    } catch {
      setError("No se pudieron cargar tus gastos. Revisa tu conexión.");
    } finally {
      setCargando(false);
    }
  }, [periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  async function añadir() {
    if (guardando) return;
    setError(null);
    if (!concepto.trim()) { setError("Escribe en qué te lo has gastado."); return; }
    if (!importe.trim()) { setError("Pon el importe."); return; }
    setGuardando(true);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/account/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ fecha, concepto, importe }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setError(b?.error || "No se pudo guardar."); return; }
      setConcepto("");
      setImporte("");
      await cargar();
    } catch {
      setError("No se pudo guardar. Revisa tu conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: number) {
    if (!confirm("¿Borrar este gasto?")) return;
    setError(null);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch(`/api/account/gastos?id=${id}`, { method: "DELETE", headers: { Authorization: "Bearer " + t } });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b?.error || "No se pudo borrar."); return; }
      setGastos((g) => g.filter((x) => x.id !== id));
    } catch {
      setError("No se pudo borrar. Revisa tu conexión.");
    }
  }

  const gastado = gastos.reduce((s, g) => s + Number(g.importe), 0);
  const queda = ganado - gastado;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Gastos</h1>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {opciones.map((o) => <option key={o.value} value={o.value} className="bg-black">{o.label}</option>)}
        </select>
      </div>

      {noActivo && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Este apartado se está activando. Vuelve a probar en un rato.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/15 bg-white/5 p-4">
          <p className="text-xs text-slate-400">Gastado</p>
          <p className="text-xl sm:text-2xl font-bold text-white tabular-nums">{eur(gastado)}</p>
        </div>
        <div className="rounded-xl border border-white/15 bg-white/5 p-4">
          <p className="text-xs text-slate-400">Ganado</p>
          <p className="text-xl sm:text-2xl font-bold text-white tabular-nums">{eur(ganado)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${queda >= 0 ? "border-emerald-400/40 bg-emerald-500/10" : "border-red-400/40 bg-red-500/10"}`}>
          <p className="text-xs text-slate-300">Te queda</p>
          <p className={`text-xl sm:text-2xl font-bold tabular-nums ${queda >= 0 ? "text-emerald-300" : "text-red-300"}`}>{eur(queda)}</p>
        </div>
      </div>

      {error && <p className="text-sm text-amber-300">{error}</p>}

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className={`${th} w-40`}>Fecha</th>
              <th className={th}>Concepto</th>
              <th className={`${th} text-right w-36`}>Importe</th>
              <th className={`${th} w-14`}></th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-emerald-500/[0.04] border-b border-white/10">
              <td className="px-3 py-2">
                <input type="date" value={fecha} max={hoyMadrid()} onChange={(e) => setFecha(e.target.value)} className={cell} />
              </td>
              <td className="px-3 py-2">
                <input type="text" value={concepto} maxLength={120} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto" className={cell} />
              </td>
              <td className="px-3 py-2">
                <input type="text" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} onKeyDown={(e) => e.key === "Enter" && añadir()} placeholder="€" className={`${cell} text-right`} />
              </td>
              <td className="px-2 py-2 text-center">
                <button onClick={añadir} disabled={guardando || noActivo} className="rounded-md bg-emerald-600 hover:bg-emerald-700 min-h-[44px] px-4 disabled:opacity-50 text-white text-sm font-semibold" title="Añadir">+</button>
              </td>
            </tr>
            {cargando ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>
            ) : gastos.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No hay gastos en este periodo. Añade el primero arriba.</td></tr>
            ) : (
              gastos.map((g) => (
                <tr key={g.id} className="border-b border-white/5 hover:bg-white/[0.04] group">
                  <td className="px-4 py-3 text-slate-300 tabular-nums whitespace-nowrap">
                    {new Date(g.fecha + "T00:00:00Z").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}
                  </td>
                  <td className="px-4 py-3 text-white">{g.concepto}</td>
                  <td className="px-4 py-3 text-right text-white font-semibold tabular-nums">{eur(Number(g.importe))}</td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => borrar(g.id)} className="text-slate-500 hover:text-red-400 text-lg leading-none px-3 py-2 min-h-[44px] min-w-[44px]" title="Borrar">×</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
