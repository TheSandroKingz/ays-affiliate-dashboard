"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";

// Mismo diseño que el apartado de Gastos del admin (cabecera, "Cuentas del mes",
// tabla con fila para añadir y filas que se editan al tocarlas), sin categorías ni
// reparto: el concepto y quién pagó los escribe el afiliado.

type Gasto = { id: number; fecha: string; pagado_por: string | null; concepto: string; importe: number };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const cell =
  "w-full rounded-md bg-white/10 border border-white/15 text-white text-base sm:text-sm px-2 py-1.5 [color-scheme:dark] placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const th = "px-4 py-3 text-xs font-medium text-slate-400 whitespace-nowrap";
const fechaMadrid = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Cada nombre, siempre del mismo color (como Kingz verde y PRZ azul).
const PALETA = ["#10b981", "#38bdf8", "#f59e0b", "#a855f7", "#ef4444", "#eab308", "#22d3ee", "#f472b6"];
const colorDe = (nombre: string) => {
  let h = 0;
  for (const c of nombre.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
};

export default function GastosAfiliadoPage() {
  const [periodo, setPeriodo] = useState(fechaMadrid(new Date()).slice(0, 7));
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [ganado, setGanado] = useState(0);
  const [personas, setPersonas] = useState<string[]>([]);
  const [mesVista, setMesVista] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [noActivo, setNoActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(fechaMadrid(new Date()));
  const [pagadoPor, setPagadoPor] = useState("");
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [ed, setEd] = useState<{ fecha: string; pagado_por: string; concepto: string; importe: string }>({ fecha: "", pagado_por: "", concepto: "", importe: "" });
  const reqRef = useRef(0);

  const opciones = useMemo(() => {
    const [y, m] = fechaMadrid(new Date()).split("-").map(Number);
    const out: { value: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const mes = MESES[d.getUTCMonth()];
      out.push({ value: d.toISOString().slice(0, 7), label: i === 0 ? "Este mes" : `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${d.getUTCFullYear()}` });
    }
    out.push({ value: "todo", label: "Todo" });
    return out;
  }, []);

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null;

  const cargar = useCallback(async () => {
    const reqId = ++reqRef.current;
    setError(null);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch(`/api/account/gastos?mes=${periodo}`, { headers: { Authorization: "Bearer " + t } });
      const b = await r.json().catch(() => ({}));
      if (reqId !== reqRef.current) return;
      if (!r.ok) { setError(b?.error || "No se pudieron cargar los gastos."); return; }
      setNoActivo(!!b.tablaFalta);
      setGastos(b.gastos ?? []);
      setGanado(Number(b.ganado ?? 0));
      setPersonas(b.personas ?? []);
      setMesVista(b.mesVista ?? null);
    } catch {
      if (reqId === reqRef.current) setError("No se pudieron cargar los gastos. Revisa tu conexión.");
    } finally {
      if (reqId === reqRef.current) setCargando(false);
    }
  }, [periodo]);

  useEffect(() => { setCargando(true); cargar(); }, [cargar]);

  async function enviar(method: "POST" | "PATCH", body: Record<string, unknown>) {
    const t = await token();
    if (!t) return false;
    const r = await fetch("/api/account/gastos", {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError(b?.error || "No se pudo guardar.");
      return false;
    }
    return true;
  }

  async function añadir() {
    if (guardando) return;
    setError(null);
    if (!concepto.trim()) { setError("Escribe en qué os lo habéis gastado."); return; }
    if (!importe.trim()) { setError("Pon el importe."); return; }
    setGuardando(true);
    try {
      if (await enviar("POST", { fecha, pagado_por: pagadoPor, concepto, importe })) {
        setConcepto("");
        setImporte("");
        await cargar();
      }
    } catch {
      setError("No se pudo guardar. Revisa tu conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEd() {
    if (editId == null) return;
    setError(null);
    try {
      if (await enviar("PATCH", { id: editId, ...ed })) {
        setEditId(null);
        await cargar();
      }
    } catch {
      setError("No se pudo guardar. Revisa tu conexión.");
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

  const total = gastos.reduce((s, g) => s + Number(g.importe), 0);
  const queda = ganado - total;
  const porPersona = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gastos) {
      const k = (g.pagado_por || "").trim() || "Sin indicar";
      m.set(k, (m.get(k) ?? 0) + Number(g.importe));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [gastos]);

  return (
    <main className="flex flex-col gap-5">
      <datalist id="gastos-personas">
        {personas.map((p) => <option key={p} value={p} />)}
      </datalist>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-white">Gastos</h1>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            onClick={() => { setRefrescando(true); cargar().finally(() => setRefrescando(false)); }}
            disabled={refrescando}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 transition"
          >
            {refrescando ? "Actualizando…" : "Actualizar"}
          </button>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {opciones.map((o) => <option key={o.value} value={o.value} className="bg-black">{o.label}</option>)}
          </select>
        </div>
      </div>

      {noActivo && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Este apartado se está activando. Vuelve a probar en un rato.
        </p>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-400">{mesVista ? "Cuentas del mes" : "Resumen del período"}</p>
          <p className={`text-2xl font-bold mt-0.5 ${gastos.length === 0 && ganado === 0 ? "text-slate-400" : queda >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {gastos.length === 0 && ganado === 0 ? "Sin gastos en este período" : `Os queda ${eur(queda)}`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Ganado <b className="text-white tabular-nums">{eur(ganado)}</b> · Gastado <b className="text-white tabular-nums">{eur(total)}</b>
          </p>
        </div>
        {porPersona.length > 0 && (
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm shrink-0">
            {porPersona.map(([nombre, puso]) => (
              <div key={nombre} className="contents">
                <span className="font-medium" style={{ color: nombre === "Sin indicar" ? "#94a3b8" : colorDe(nombre) }}>{nombre}</span>
                <span className="text-right text-slate-300">puso <b className="text-white tabular-nums">{eur(puso)}</b></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-amber-300">{error}</p>}

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className={th}>Fecha</th>
              <th className={th}>Pagó</th>
              <th className={th}>Concepto</th>
              <th className={`${th} text-right`}>Importe</th>
              <th className={`${th} w-8`}></th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-emerald-500/[0.04] border-b border-white/10">
              <td className="px-3 py-2 w-40">
                <input type="date" value={fecha} max={fechaMadrid(new Date())} onChange={(e) => setFecha(e.target.value)} className={cell} />
              </td>
              <td className="px-3 py-2 w-40">
                <input type="text" list="gastos-personas" value={pagadoPor} maxLength={40} onChange={(e) => setPagadoPor(e.target.value)} placeholder="Quién" className={cell} />
              </td>
              <td className="px-3 py-2">
                <input type="text" value={concepto} maxLength={120} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto" className={cell} />
              </td>
              <td className="px-3 py-2 w-36">
                <input type="text" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !guardando && añadir()} placeholder="€" className={`${cell} text-right`} />
              </td>
              <td className="px-2 py-2 text-center">
                <button onClick={añadir} disabled={guardando || noActivo} className="rounded-md bg-emerald-600 hover:bg-emerald-700 min-h-[44px] px-4 disabled:opacity-50 text-white text-sm font-semibold w-8 h-8 leading-none" title="Añadir">+</button>
              </td>
            </tr>

            {cargando ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>
            ) : gastos.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No hay gastos en este período. Añade el primero arriba.</td></tr>
            ) : (
              gastos.map((g) => {
                if (editId === g.id) {
                  return (
                    <tr key={g.id} className="bg-white/[0.06] border-b border-white/5">
                      <td className="px-3 py-2"><input type="date" value={ed.fecha} max={fechaMadrid(new Date())} onChange={(e) => setEd((s) => ({ ...s, fecha: e.target.value }))} className={cell} /></td>
                      <td className="px-3 py-2"><input type="text" list="gastos-personas" value={ed.pagado_por} maxLength={40} onChange={(e) => setEd((s) => ({ ...s, pagado_por: e.target.value }))} placeholder="Quién" className={cell} /></td>
                      <td className="px-3 py-2"><input type="text" value={ed.concepto} maxLength={120} onChange={(e) => setEd((s) => ({ ...s, concepto: e.target.value }))} className={cell} /></td>
                      <td className="px-3 py-2"><input type="text" inputMode="decimal" value={ed.importe} onChange={(e) => setEd((s) => ({ ...s, importe: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && guardarEd()} className={`${cell} text-right`} /></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={guardarEd} className="text-emerald-400 hover:text-emerald-300 px-3 py-2 min-h-[44px]" title="Guardar">✓</button>
                          <button onClick={() => setEditId(null)} className="text-slate-500 hover:text-white px-3 py-2 min-h-[44px]" title="Cancelar">×</button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const color = g.pagado_por ? colorDe(g.pagado_por) : null;
                return (
                  <tr
                    key={g.id}
                    className="group cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.04]"
                    onClick={() => { setEditId(g.id); setEd({ fecha: g.fecha, pagado_por: g.pagado_por ?? "", concepto: g.concepto, importe: String(g.importe) }); }}
                  >
                    <td className="px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">{ddmm(g.fecha)}</td>
                    <td className="px-4 py-3">
                      {color ? (
                        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${color}22`, color }}>{g.pagado_por}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{g.concepto || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white tabular-nums whitespace-nowrap">{eur(Number(g.importe))}</td>
                    <td className="px-2 py-3 text-center">
                      <button onClick={(e) => { e.stopPropagation(); borrar(g.id); }} className="text-slate-500 hover:text-red-400 text-lg leading-none px-3 py-2 min-h-[44px] min-w-[44px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition" title="Borrar">×</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {gastos.length > 0 && (
            <tfoot>
              <tr className="border-t border-white/10 bg-white/[0.04] font-semibold">
                <td className="px-4 py-3 text-white" colSpan={3}>Total</td>
                <td className="px-4 py-3 text-right text-white tabular-nums whitespace-nowrap">{eur(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-slate-500">Toca una fila para editarla. &quot;Pagó&quot; = quién puso ese dinero.</p>
    </main>
  );
}
