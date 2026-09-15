"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";
import RepartoEditor from "@/components/RepartoEditor";
import { cuentasEquipo, colorDe as colorMiembro, esMiembro, type Miembro } from "@/lib/repartoGastos";

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

const colorDe = colorMiembro;

export default function GastosAfiliadoPage() {
  const [periodo, setPeriodo] = useState(fechaMadrid(new Date()).slice(0, 7));
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [ganado, setGanado] = useState(0);
  const [personas, setPersonas] = useState<string[]>([]);
  const [equipo, setEquipo] = useState<Miembro[]>([]);
  const [editandoReparto, setEditandoReparto] = useState(false);
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
      setEquipo(b.equipo ?? []);
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

  async function guardarReparto(miembros: Miembro[]): Promise<string | null> {
    const t = await token();
    if (!t) return "Sesión caducada.";
    const r = await fetch("/api/account/gastos", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ miembros }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return b?.error || "No se pudo guardar el reparto.";
    setEquipo(b.miembros ?? []);
    setEditandoReparto(false);
    return null;
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
  const c = equipo.length ? cuentasEquipo(gastos, equipo) : null;
  // Texto grande del recuadro, como "Kingz le debe a PRZ" en el del admin.
  const liquidacion: { texto: string; color: string } = !c
    ? gastos.length === 0 && ganado === 0
      ? { texto: "Sin gastos en este período", color: "text-slate-400" }
      : { texto: `Os queda ${eur(queda)}`, color: queda >= 0 ? "text-emerald-300" : "text-red-300" }
    : gastos.length === 0
    ? { texto: "Sin gastos en este período", color: "text-slate-400" }
    : !mesVista
    ? { texto: `Total del período: ${eur(total)}`, color: "text-slate-200" }
    : c.sinPagador
    ? { texto: "Marca quién pagó cada gasto (—) para ver quién debe a quién", color: "text-amber-300 !text-lg" }
    : c.transferencias.length === 0
    ? { texto: "Cuentas en paz 👌 nadie debe nada", color: "text-slate-200" }
    : { texto: c.transferencias.map((x) => `${x.de} le debe a ${x.a} ${eur(x.importe)}`).join(" · "), color: `text-emerald-300 ${c.transferencias.length > 1 ? "!text-lg" : ""}` };
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
          <p className={`text-2xl font-bold mt-0.5 ${liquidacion.color}`}>{liquidacion.texto}</p>
          <p className="text-xs text-slate-400 mt-1">
            Ganado <b className="text-white tabular-nums">{eur(ganado)}</b> · Gastado <b className="text-white tabular-nums">{eur(total)}</b>
            {c && <> · Os queda <b className={`tabular-nums ${queda >= 0 ? "text-emerald-300" : "text-red-300"}`}>{eur(queda)}</b></>}
          </p>
        </div>
        {c ? (
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm shrink-0">
            {c.filas.map((f) => (
              <div key={f.nombre} className="contents">
                <span className="font-medium" style={{ color: colorDe(f.nombre) }}>{f.nombre}</span>
                <span className="text-right text-slate-300">
                  puso <b className="text-white tabular-nums">{eur(f.puso)}</b> · le toca <b className="text-white tabular-nums">{eur(f.toca)}</b>
                </span>
              </div>
            ))}
          </div>
        ) : porPersona.length > 0 && (
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

      <p className="text-xs text-slate-500">
        {equipo.length ? (
          <>
            Reparto:{" "}
            {equipo.map((m, i) => (
              <span key={m.nombre}>
                {i > 0 && " / "}
                <b className="text-slate-400">{m.nombre}</b> {m.pct.toLocaleString("es-ES")}%
              </span>
            ))}
          </>
        ) : (
          "Si trabajáis en equipo, poned qué % le toca a cada uno para ver quién debe a quién."
        )}
        {" · "}
        <button onClick={() => setEditandoReparto((v) => !v)} className="text-emerald-400 hover:text-emerald-300">
          {equipo.length ? "Cambiar reparto" : "Poner reparto"}
        </button>
      </p>

      {editandoReparto && (
        <RepartoEditor inicial={equipo} onGuardar={guardarReparto} onCancelar={() => setEditandoReparto(false)} />
      )}

      {error && <p className="text-sm text-amber-300">{error}</p>}

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 640 + equipo.length * 110 }}>
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className={th}>Fecha</th>
              <th className={th}>Pagó</th>
              <th className={th}>Concepto</th>
              <th className={`${th} text-right`}>Importe</th>
              {equipo.map((m) => <th key={m.nombre} className={`${th} text-right`}>{m.nombre}</th>)}
              <th className={`${th} w-8`}></th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-emerald-500/[0.04] border-b border-white/10">
              <td className="px-3 py-2 w-40">
                <input type="date" value={fecha} max={fechaMadrid(new Date())} onChange={(e) => setFecha(e.target.value)} className={cell} />
              </td>
              <td className="px-3 py-2 w-40">
                {equipo.length ? (
                  <select value={pagadoPor} onChange={(e) => setPagadoPor(e.target.value)} className={cell}>
                    <option value="" className="bg-black">—</option>
                    {equipo.map((m) => <option key={m.nombre} value={m.nombre} className="bg-black">{m.nombre}</option>)}
                  </select>
                ) : (
                  <input type="text" list="gastos-personas" value={pagadoPor} maxLength={40} onChange={(e) => setPagadoPor(e.target.value)} placeholder="Quién" className={cell} />
                )}
              </td>
              <td className="px-3 py-2">
                <input type="text" value={concepto} maxLength={120} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto" className={cell} />
              </td>
              <td className="px-3 py-2 w-36">
                <input type="text" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !guardando && añadir()} placeholder="€" className={`${cell} text-right`} />
              </td>
              {equipo.map((m) => <td key={m.nombre} className="px-3 py-2 text-right text-xs text-slate-500">{m.pct.toLocaleString("es-ES")}%</td>)}
              <td className="px-2 py-2 text-center">
                <button onClick={añadir} disabled={guardando || noActivo} className="rounded-md bg-emerald-600 hover:bg-emerald-700 min-h-[44px] px-4 disabled:opacity-50 text-white text-sm font-semibold w-8 h-8 leading-none" title="Añadir">+</button>
              </td>
            </tr>

            {cargando ? (
              <tr><td colSpan={5 + equipo.length} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>
            ) : gastos.length === 0 ? (
              <tr><td colSpan={5 + equipo.length} className="px-4 py-6 text-center text-slate-500">No hay gastos en este período. Añade el primero arriba.</td></tr>
            ) : (
              gastos.map((g) => {
                if (editId === g.id) {
                  return (
                    <tr key={g.id} className="bg-white/[0.06] border-b border-white/5">
                      <td className="px-3 py-2"><input type="date" value={ed.fecha} max={fechaMadrid(new Date())} onChange={(e) => setEd((s) => ({ ...s, fecha: e.target.value }))} className={cell} /></td>
                      <td className="px-3 py-2">
                        {equipo.length ? (
                          <select value={esMiembro(ed.pagado_por, equipo) ? equipo.find((m) => m.nombre.toLowerCase() === ed.pagado_por.trim().toLowerCase())?.nombre : ""} onChange={(e) => setEd((s) => ({ ...s, pagado_por: e.target.value }))} className={cell}>
                            <option value="" className="bg-black">—</option>
                            {equipo.map((m) => <option key={m.nombre} value={m.nombre} className="bg-black">{m.nombre}</option>)}
                          </select>
                        ) : (
                          <input type="text" list="gastos-personas" value={ed.pagado_por} maxLength={40} onChange={(e) => setEd((s) => ({ ...s, pagado_por: e.target.value }))} placeholder="Quién" className={cell} />
                        )}
                      </td>
                      <td className="px-3 py-2"><input type="text" value={ed.concepto} maxLength={120} onChange={(e) => setEd((s) => ({ ...s, concepto: e.target.value }))} className={cell} /></td>
                      <td className="px-3 py-2"><input type="text" inputMode="decimal" value={ed.importe} onChange={(e) => setEd((s) => ({ ...s, importe: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && guardarEd()} className={`${cell} text-right`} /></td>
                      {equipo.map((m) => <td key={m.nombre} className="px-3 py-2 text-right text-xs text-slate-500">{m.pct.toLocaleString("es-ES")}%</td>)}
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
                      {color && (!equipo.length || esMiembro(g.pagado_por, equipo)) ? (
                        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${color}22`, color }}>{g.pagado_por}</span>
                      ) : (
                        <span className={equipo.length ? "text-amber-400" : "text-slate-500"}>{equipo.length && g.pagado_por ? `${g.pagado_por}?` : "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{g.concepto || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white tabular-nums whitespace-nowrap">{eur(Number(g.importe))}</td>
                    {equipo.map((m) => (
                      <td key={m.nombre} className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: colorDe(m.nombre) }}>
                        {eur((Number(g.importe) * m.pct) / 100)} <span className="text-[10px] text-slate-500">({m.pct.toLocaleString("es-ES")}%)</span>
                      </td>
                    ))}
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
                {c && c.filas.map((f) => (
                  <td key={f.nombre} className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: colorDe(f.nombre) }}>{eur(f.toca)}</td>
                ))}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Toca una fila para editarla. &quot;Pagó&quot; = quién adelantó el dinero{equipo.length ? "; cada columna con un nombre = lo que le toca poner a esa persona." : "."}
      </p>
    </main>
  );
}
