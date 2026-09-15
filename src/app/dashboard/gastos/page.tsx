"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";
import ConfiguradorGastos from "@/components/ConfiguradorGastos";
import { cuentasEquipo, colorDe, pctDeConcepto, socioDe, type ConfigGastos } from "@/lib/repartoGastos";

// Mismo diseño que el Gastos del admin (cabecera, "Cuentas del mes", tabla con fila
// para añadir y filas que se editan al tocarlas). Como el del admin con su socio,
// es SOLO para hacer cuentas: no se resta de lo que gana. La primera vez el afiliado
// configura cuántos socios son, sus nombres y sus conceptos con el % de cada uno;
// queda guardado y al apuntar un gasto solo elige concepto, quién pagó e importe.

type Gasto = { id: number; fecha: string; pagado_por: string | null; concepto: string; importe: number };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const cell =
  "w-full rounded-md bg-white/10 border border-white/15 text-white text-base sm:text-sm px-2 py-1.5 [color-scheme:dark] placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const th = "px-4 py-3 text-xs font-medium text-slate-400 whitespace-nowrap";
const fechaMadrid = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtPct = (p: number) => `${p.toLocaleString("es-ES")}%`;

export default function GastosAfiliadoPage() {
  const [periodo, setPeriodo] = useState(fechaMadrid(new Date()).slice(0, 7));
  const [gastos, setGastos] = useState<Gasto[]>([]);
  // undefined = cargando; null = aún no ha configurado sus gastos.
  const [config, setConfig] = useState<ConfigGastos | null | undefined>(undefined);
  const [configurando, setConfigurando] = useState(false);
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
      setConfig(b.config ?? null);
      setMesVista(b.mesVista ?? null);
    } catch {
      if (reqId === reqRef.current) setError("No se pudieron cargar los gastos. Revisa tu conexión.");
    } finally {
      if (reqId === reqRef.current) setCargando(false);
    }
  }, [periodo]);

  useEffect(() => { setCargando(true); cargar(); }, [cargar]);

  // Fila de añadir: su primer concepto y su primer socio ya elegidos.
  useEffect(() => {
    if (!config) return;
    setConcepto((c) => (config.conceptos.some((x) => x.nombre === c) ? c : config.conceptos[0]?.nombre ?? ""));
    setPagadoPor((p) => (config.socios.includes(p) ? p : config.socios[0] ?? ""));
  }, [config]);

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
    if (!concepto) { setError("Elige el concepto."); return; }
    if (!importe.trim()) { setError("Pon el importe."); return; }
    setGuardando(true);
    try {
      if (await enviar("POST", { fecha, pagado_por: esEquipo ? pagadoPor : "", concepto, importe })) {
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

  async function guardarConfig(nueva: ConfigGastos): Promise<string | null> {
    const t = await token();
    if (!t) return "Sesión caducada.";
    const r = await fetch("/api/account/gastos", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ config: nueva }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return b?.error || "No se pudo guardar la configuración.";
    setConfig(b.config ?? nueva);
    setConfigurando(false);
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

  const socios = config?.socios ?? [];
  const esEquipo = socios.length >= 2;
  const total = gastos.reduce((s, g) => s + Number(g.importe), 0);
  const c = config && esEquipo ? cuentasEquipo(gastos, config) : null;
  // Texto grande del recuadro, como "Kingz le debe a PRZ" en el del admin.
  const liquidacion: { texto: string; color: string } = gastos.length === 0
    ? { texto: "Sin gastos en este período", color: "text-slate-400" }
    : !c
    ? { texto: `Gastado ${eur(total)}`, color: "text-slate-200" }
    : !mesVista
    ? { texto: `Total del período: ${eur(total)}`, color: "text-slate-200" }
    : c.sinPagador
    ? { texto: "Marca quién pagó cada gasto (—) para ver quién debe a quién", color: "text-amber-300 !text-lg" }
    : c.transferencias.length === 0
    ? { texto: "Cuentas en paz 👌 nadie debe nada", color: "text-slate-200" }
    : { texto: c.transferencias.map((x) => `${x.de} le debe a ${x.a} ${eur(x.importe)}`).join(" · "), color: `text-emerald-300 ${c.transferencias.length > 1 ? "!text-lg" : ""}` };

  const columnas = 4 + (esEquipo ? 1 + socios.length : 0);
  const pctFila = (conc: string) => (config ? pctDeConcepto(conc, config) : { pct: [] as number[], conocido: true });
  const chipSocio = (nombre: string | null) => {
    const s = config ? socioDe(nombre, config) : null;
    if (!s) return <span className="text-amber-400">{nombre ? `${nombre}?` : "—"}</span>;
    const color = colorDe(s);
    return <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${color}22`, color }}>{s}</span>;
  };
  const opcionesConcepto = (actual?: string) => {
    const lista = (config?.conceptos ?? []).map((x) => x.nombre);
    return actual && !lista.includes(actual) ? [actual, ...lista] : lista;
  };

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-white">Gastos</h1>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {config && !configurando && (
            <button
              onClick={() => setConfigurando(true)}
              className="rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-medium px-4 py-2 transition"
            >
              Configurar
            </button>
          )}
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

      {error && <p className="text-sm text-amber-300">{error}</p>}

      {config === null && !noActivo ? (
        <ConfiguradorGastos inicial={null} titulo="Configura tus gastos" onGuardar={guardarConfig} />
      ) : (
        <>
          {configurando && config && (
            <ConfiguradorGastos inicial={config} onGuardar={guardarConfig} onCancelar={() => setConfigurando(false)} />
          )}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-400">{mesVista ? "Cuentas del mes" : "Resumen del período"}</p>
              <p className={`text-2xl font-bold mt-0.5 ${liquidacion.color}`}>{liquidacion.texto}</p>
              {c && gastos.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">
                  Gastado <b className="text-white tabular-nums">{eur(total)}</b>
                </p>
              )}
            </div>
            {c && (
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
            )}
          </div>

          {config && esEquipo && (
            <p className="text-xs text-slate-500">
              Reparto por concepto ({socios.join(" / ")}):{" "}
              {config.conceptos.map((x, i) => (
                <span key={x.nombre}>
                  {i > 0 && "; "}
                  <b className="text-slate-400">{x.nombre}</b> {x.pct.map((p) => p.toLocaleString("es-ES")).join("/")}
                </span>
              ))}
              .
            </p>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: esEquipo ? 640 + socios.length * 110 : 520 }}>
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className={th}>Fecha</th>
                  <th className={th}>Concepto</th>
                  {esEquipo && <th className={th}>Pagó</th>}
                  <th className={`${th} text-right`}>Importe</th>
                  {esEquipo && socios.map((s) => <th key={s} className={`${th} text-right`}>{s}</th>)}
                  <th className={`${th} w-8`}></th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-emerald-500/[0.04] border-b border-white/10">
                  <td className="px-3 py-2 w-40">
                    <input type="date" value={fecha} max={fechaMadrid(new Date())} onChange={(e) => setFecha(e.target.value)} className={cell} />
                  </td>
                  <td className="px-3 py-2">
                    <select value={concepto} onChange={(e) => setConcepto(e.target.value)} className={cell}>
                      {opcionesConcepto().map((x) => <option key={x} value={x} className="bg-black">{x}</option>)}
                    </select>
                  </td>
                  {esEquipo && (
                    <td className="px-3 py-2 w-36">
                      <select value={pagadoPor} onChange={(e) => setPagadoPor(e.target.value)} className={cell}>
                        {socios.map((s) => <option key={s} value={s} className="bg-black">{s}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="px-3 py-2 w-32">
                    <input type="text" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !guardando && añadir()} placeholder="€" className={`${cell} text-right`} />
                  </td>
                  {esEquipo && socios.map((s, i) => (
                    <td key={s} className="px-3 py-2 text-right text-xs text-slate-500">{fmtPct(pctFila(concepto).pct[i] ?? 0)}</td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <button onClick={añadir} disabled={guardando || noActivo || !config} className="rounded-md bg-emerald-600 hover:bg-emerald-700 min-h-[44px] px-4 disabled:opacity-50 text-white text-sm font-semibold w-8 h-8 leading-none" title="Añadir">+</button>
                  </td>
                </tr>

                {cargando ? (
                  <tr><td colSpan={columnas + 1} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>
                ) : gastos.length === 0 ? (
                  <tr><td colSpan={columnas + 1} className="px-4 py-6 text-center text-slate-500">No hay gastos en este período. Añade el primero arriba.</td></tr>
                ) : (
                  gastos.map((g) => {
                    if (editId === g.id) {
                      const socioEd = config ? socioDe(ed.pagado_por, config) : null;
                      return (
                        <tr key={g.id} className="bg-white/[0.06] border-b border-white/5">
                          <td className="px-3 py-2"><input type="date" value={ed.fecha} max={fechaMadrid(new Date())} onChange={(e) => setEd((s) => ({ ...s, fecha: e.target.value }))} className={cell} /></td>
                          <td className="px-3 py-2">
                            <select value={ed.concepto} onChange={(e) => setEd((s) => ({ ...s, concepto: e.target.value }))} className={cell}>
                              {opcionesConcepto(g.concepto).map((x) => <option key={x} value={x} className="bg-black">{x}</option>)}
                            </select>
                          </td>
                          {esEquipo && (
                            <td className="px-3 py-2">
                              <select value={socioEd ?? ""} onChange={(e) => setEd((s) => ({ ...s, pagado_por: e.target.value }))} className={cell}>
                                {!socioEd && <option value="" className="bg-black">—</option>}
                                {socios.map((s) => <option key={s} value={s} className="bg-black">{s}</option>)}
                              </select>
                            </td>
                          )}
                          <td className="px-3 py-2"><input type="text" inputMode="decimal" value={ed.importe} onChange={(e) => setEd((s) => ({ ...s, importe: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && guardarEd()} className={`${cell} text-right`} /></td>
                          {esEquipo && socios.map((s, i) => (
                            <td key={s} className="px-3 py-2 text-right text-xs text-slate-500">{fmtPct(pctFila(ed.concepto).pct[i] ?? 0)}</td>
                          ))}
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1">
                              <button onClick={guardarEd} className="text-emerald-400 hover:text-emerald-300 px-3 py-2 min-h-[44px]" title="Guardar">✓</button>
                              <button onClick={() => setEditId(null)} className="text-slate-500 hover:text-white px-3 py-2 min-h-[44px]" title="Cancelar">×</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const { pct, conocido } = pctFila(g.concepto);
                    return (
                      <tr
                        key={g.id}
                        className="group cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.04]"
                        onClick={() => { setEditId(g.id); setEd({ fecha: g.fecha, pagado_por: g.pagado_por ?? "", concepto: g.concepto, importe: String(g.importe) }); }}
                      >
                        <td className="px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">{ddmm(g.fecha)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 text-slate-200">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorDe(g.concepto) }} />
                            {g.concepto}
                            {esEquipo && !conocido && <span className="text-[10px] text-slate-500">(a partes iguales)</span>}
                          </span>
                        </td>
                        {esEquipo && <td className="px-4 py-3">{chipSocio(g.pagado_por)}</td>}
                        <td className="px-4 py-3 text-right font-semibold text-white tabular-nums whitespace-nowrap">{eur(Number(g.importe))}</td>
                        {esEquipo && socios.map((s, i) => (
                          <td key={s} className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: colorDe(s) }}>
                            {eur((Number(g.importe) * (pct[i] ?? 0)) / 100)} <span className="text-[10px] text-slate-500">({fmtPct(pct[i] ?? 0)})</span>
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
                    <td className="px-4 py-3 text-white" colSpan={esEquipo ? 3 : 2}>Total</td>
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
            Toca una fila para editarla.
            {esEquipo && <> &quot;Pagó&quot; = quién adelantó el dinero; cada columna con un nombre = lo que le toca poner a esa persona.</>}
          </p>
        </>
      )}
    </main>
  );
}
