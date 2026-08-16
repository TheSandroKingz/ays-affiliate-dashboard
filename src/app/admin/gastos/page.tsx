"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Copy,
  Pencil,
  Trash2,
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { eur } from "@/lib/format";

type Gasto = {
  id: number;
  fecha: string;
  categoria: string;
  quien: string;
  concepto: string;
  importe: number;
};
type Datos = {
  etiqueta: string;
  gastos: Gasto[];
  total: number;
  totalAnterior: number | null;
  porQuien: { kingz: number; prz: number; comun: number };
  porCategoria: {
    publicidad: number;
    claude_prog: number;
    claude_bots: number;
    otros: number;
  };
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const CATS = [
  { value: "publicidad", label: "Publicidad", color: "#f59e0b" },
  { value: "claude_prog", label: "Claude · programación", color: "#a855f7" },
  { value: "claude_bots", label: "Claude · bots", color: "#38bdf8" },
  { value: "otros", label: "Otros", color: "#64748b" },
] as const;
const CAT = Object.fromEntries(CATS.map((c) => [c.value, c])) as Record<
  string,
  (typeof CATS)[number]
>;

const QUIENES = [
  { value: "kingz", label: "Kingz (yo)", corto: "Kingz", color: "#10b981" },
  { value: "prz", label: "PRZ (socio)", corto: "PRZ", color: "#38bdf8" },
  { value: "comun", label: "Común", corto: "Común", color: "#94a3b8" },
] as const;
const QUIEN = Object.fromEntries(QUIENES.map((q) => [q.value, q])) as Record<
  string,
  (typeof QUIENES)[number]
>;

const fechaMadrid = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

const inputCls =
  "rounded-lg bg-white/10 border border-white/20 text-white text-base sm:text-sm px-3 py-2 [color-scheme:dark] placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function GastosPage() {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(""); // "" = este mes · "YYYY-MM" · "historico"

  // Formulario de alta (plegable)
  const hoyStr = fechaMadrid(new Date());
  const [abrirForm, setAbrirForm] = useState(false);
  const [fecha, setFecha] = useState(hoyStr);
  const [categoria, setCategoria] = useState("publicidad");
  const [quien, setQuien] = useState("kingz");
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const importeRef = useRef<HTMLInputElement>(null);

  // Edición en línea
  const [editId, setEditId] = useState<number | null>(null);
  const [ed, setEd] = useState<Partial<Gasto>>({});

  const opciones = useMemo(() => {
    const hoy = new Date();
    const outs: { value: string; label: string }[] = [{ value: "", label: "Este mes" }];
    for (let i = 1; i <= 11; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      outs.push({ value: ym, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` });
    }
    outs.push({ value: "historico", label: "Histórico (todo)" });
    return outs;
  }, []);

  async function token() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || session.user.id !== ADMIN_USER_ID) {
      router.replace("/dashboard");
      return null;
    }
    return session.access_token;
  }

  async function cargar() {
    setError(null);
    try {
      const t = await token();
      if (!t) return;
      const q = periodo ? `?mes=${periodo}` : "";
      const r = await fetch(`/api/admin/gastos${q}`, {
        headers: { Authorization: "Bearer " + t },
      });
      if (!r.ok) {
        setError("No autorizado.");
        return;
      }
      setDatos(await r.json());
    } catch {
      setError("No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    setCargando(true);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  function rapido(cat: string, q: string) {
    setCategoria(cat);
    setQuien(q);
    setAbrirForm(true);
    setTimeout(() => importeRef.current?.focus(), 50);
  }

  async function añadir(e: React.FormEvent) {
    e.preventDefault();
    const imp = Number(importe.replace(",", "."));
    if (!Number.isFinite(imp) || imp <= 0) {
      setError("Pon un importe válido.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/admin/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ fecha, categoria, quien, concepto, importe: imp }),
      });
      if (!r.ok) {
        setError("No se pudo guardar.");
        return;
      }
      setConcepto("");
      setImporte("");
      await cargar();
      setTimeout(() => importeRef.current?.focus(), 50);
    } finally {
      setGuardando(false);
    }
  }

  async function copiarMesPasado() {
    const mesDestino = periodo && periodo !== "historico" ? periodo : hoyStr.slice(0, 7);
    if (!confirm("¿Copiar los gastos del mes pasado a este mes? (podrás editar o borrar los que no valgan)"))
      return;
    setCopiando(true);
    setAviso(null);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/admin/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ accion: "copiar_mes", mes: mesDestino }),
      });
      const b = await r.json().catch(() => ({}));
      if (r.ok) {
        setAviso(
          b.copiados > 0
            ? `Copiados ${b.copiados} gasto(s) del mes pasado.`
            : "No había gastos nuevos que copiar del mes pasado."
        );
        await cargar();
      } else setError("No se pudo copiar.");
    } finally {
      setCopiando(false);
    }
  }

  async function guardarEdicion() {
    if (editId == null) return;
    const imp = Number(String(ed.importe).replace(",", "."));
    if (!Number.isFinite(imp) || imp <= 0) return;
    const t = await token();
    if (!t) return;
    const r = await fetch("/api/admin/gastos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ ...ed, id: editId, importe: imp }),
    });
    if (r.ok) {
      setEditId(null);
      setEd({});
      await cargar();
    }
  }

  async function borrar(id: number) {
    if (!confirm("¿Borrar este gasto?")) return;
    const t = await token();
    if (!t) return;
    const r = await fetch(`/api/admin/gastos?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + t },
    });
    if (r.ok) await cargar();
  }

  const total = datos?.total ?? 0;
  const delta =
    datos && datos.totalAnterior != null ? total - datos.totalAnterior : null;

  return (
    <main className="flex flex-col gap-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Gastos</h1>
          <p className="text-sm text-slate-400 mt-1">
            Lo que gastáis en el negocio (publicidad, Claude…), para hacer cuentas
            fácil cada mes. Importes en euros.
          </p>
        </div>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className={inputCls}
        >
          {opciones.map((o) => (
            <option key={o.value} value={o.value} className="bg-black">
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setAbrirForm((v) => !v)}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} /> Añadir gasto
        </button>
        <button
          onClick={copiarMesPasado}
          disabled={copiando || periodo === "historico"}
          className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/20 text-slate-200 text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
          title="Copia los gastos fijos del mes anterior (Claude, etc.)"
        >
          <Copy size={15} /> {copiando ? "Copiando…" : "Copiar mes pasado"}
        </button>
        {/* Atajos rápidos para los gastos que se repiten */}
        <span className="mx-1 h-5 w-px bg-white/10 hidden sm:block" />
        <button
          onClick={() => rapido("claude_prog", "comun")}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition"
        >
          <span className="w-2 h-2 rounded-full" style={{ background: CAT.claude_prog.color }} />
          Claude programación
        </button>
        <button
          onClick={() => rapido("claude_bots", "comun")}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition"
        >
          <span className="w-2 h-2 rounded-full" style={{ background: CAT.claude_bots.color }} />
          Claude bots
        </button>
      </div>

      {aviso && (
        <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 rounded-lg px-3 py-2">
          {aviso}
        </p>
      )}
      {error && <p className="text-sm text-amber-300">{error}</p>}

      {/* Formulario de alta (plegable) */}
      {abrirForm && (
        <form
          onSubmit={añadir}
          className="rounded-xl border border-white/15 bg-white/[0.06] p-4 grid gap-3 sm:grid-cols-[auto_1fr_1fr_1.4fr_auto_auto] sm:items-end"
        >
          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Categoría</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls}>
              {CATS.map((c) => (
                <option key={c.value} value={c.value} className="bg-black">{c.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Quién</span>
            <select value={quien} onChange={(e) => setQuien(e.target.value)} className={inputCls}>
              {QUIENES.map((q) => (
                <option key={q.value} value={q.value} className="bg-black">{q.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Concepto (opcional)</span>
            <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="ej. anuncio TikTok" className={inputCls} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Importe €</span>
            <input ref={importeRef} type="text" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0" className={`${inputCls} w-24`} />
          </label>
          <button type="submit" disabled={guardando} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap">
            {guardando ? "…" : "Guardar"}
          </button>
        </form>
      )}

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : !datos ? (
        <p className="text-sm text-slate-400">No se pudo cargar.</p>
      ) : (
        <>
          {/* Hero: total + comparativa */}
          <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
            <div className="bg-white/10 backdrop-blur border border-emerald-400/50 rounded-xl p-6 shadow-[0_0_20px_rgba(16,185,129,0.45),0_0_45px_rgba(16,185,129,0.2)]">
              <p className="text-sm font-medium text-slate-300 mb-2">
                Total del período
              </p>
              <p className="text-4xl font-bold text-white">{eur(total)}</p>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="text-slate-400">{datos.gastos.length} gasto(s)</span>
                {delta != null && Math.abs(delta) >= 0.01 && (
                  <span
                    className={`inline-flex items-center gap-1 ${
                      delta > 0 ? "text-amber-300" : "text-emerald-300"
                    }`}
                  >
                    {delta > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {eur(Math.abs(delta))} vs mes pasado
                  </span>
                )}
              </div>
            </div>

            {/* Por persona (barra segmentada) */}
            <div className="bg-white/[0.06] border border-white/15 rounded-xl p-5">
              <p className="text-sm font-medium text-slate-300 mb-3">Quién ha puesto</p>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/10 mb-4">
                {QUIENES.map((q) => {
                  const v = datos.porQuien[q.value as keyof typeof datos.porQuien];
                  const pct = total > 0 ? (v / total) * 100 : 0;
                  return pct > 0 ? (
                    <div key={q.value} style={{ width: `${pct}%`, background: q.color }} />
                  ) : null;
                })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {QUIENES.map((q) => (
                  <div key={q.value}>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="w-2 h-2 rounded-full" style={{ background: q.color }} />
                      {q.corto}
                    </div>
                    <p className="text-lg font-semibold text-white">
                      {eur(datos.porQuien[q.value as keyof typeof datos.porQuien])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Por categoría (lista con barras de proporción) */}
          <div className="bg-white/[0.06] border border-white/15 rounded-xl p-5">
            <p className="text-sm font-medium text-slate-300 mb-4">Por categoría</p>
            <div className="flex flex-col gap-3">
              {CATS.map((c) => {
                const v = datos.porCategoria[c.value as keyof typeof datos.porCategoria];
                const pct = total > 0 ? (v / total) * 100 : 0;
                return (
                  <div key={c.value} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-40 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="text-sm text-slate-300 truncate">{c.label}</span>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                    <span className="w-24 text-right text-sm font-medium text-white">{eur(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lista de gastos */}
          {datos.gastos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
              <p className="text-sm text-slate-400">
                No hay gastos anotados en este período.
              </p>
              <button
                onClick={() => setAbrirForm(true)}
                className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300"
              >
                <Plus size={15} /> Añadir el primero
              </button>
            </div>
          ) : (
            <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[640px]">
                <thead>
                  <tr className="bg-white/10 text-slate-300 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Fecha</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Categoría</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Quién</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Concepto</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-right">Importe</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {datos.gastos.map((g, i) => {
                    const enEd = editId === g.id;
                    const c = CAT[g.categoria];
                    const q = QUIEN[g.quien];
                    return (
                      <tr
                        key={g.id}
                        className={`${i % 2 ? "bg-white/[0.03]" : ""} border-t border-white/5`}
                      >
                        {enEd ? (
                          <>
                            <td className="px-3 py-2">
                              <input type="date" value={ed.fecha ?? g.fecha} onChange={(e) => setEd((s) => ({ ...s, fecha: e.target.value }))} className={`${inputCls} text-xs`} />
                            </td>
                            <td className="px-3 py-2">
                              <select value={ed.categoria ?? g.categoria} onChange={(e) => setEd((s) => ({ ...s, categoria: e.target.value }))} className={`${inputCls} text-xs`}>
                                {CATS.map((x) => <option key={x.value} value={x.value} className="bg-black">{x.label}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select value={ed.quien ?? g.quien} onChange={(e) => setEd((s) => ({ ...s, quien: e.target.value }))} className={`${inputCls} text-xs`}>
                                {QUIENES.map((x) => <option key={x.value} value={x.value} className="bg-black">{x.corto}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={ed.concepto ?? g.concepto} onChange={(e) => setEd((s) => ({ ...s, concepto: e.target.value }))} className={`${inputCls} text-xs w-full`} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" inputMode="decimal" value={ed.importe ?? g.importe} onChange={(e) => setEd((s) => ({ ...s, importe: e.target.value as unknown as number }))} className={`${inputCls} text-xs w-20 text-right`} />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={guardarEdicion} className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" title="Guardar"><Check size={15} /></button>
                                <button onClick={() => { setEditId(null); setEd({}); }} className="p-1.5 rounded-md bg-white/5 text-slate-400 hover:bg-white/10" title="Cancelar"><X size={15} /></button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{g.fecha.slice(8)}/{g.fecha.slice(5, 7)}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-2 text-slate-200">
                                <span className="w-2 h-2 rounded-full" style={{ background: c?.color ?? "#64748b" }} />
                                {c?.label ?? g.categoria}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{ background: `${q?.color ?? "#94a3b8"}22`, color: q?.color ?? "#94a3b8" }}
                              >
                                {q?.corto ?? g.quien}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-300">{g.concepto || "—"}</td>
                            <td className="px-4 py-3 text-right font-semibold text-white whitespace-nowrap">{eur(g.importe)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => { setEditId(g.id); setEd({ fecha: g.fecha, categoria: g.categoria, quien: g.quien, concepto: g.concepto, importe: g.importe }); }} className="p-1.5 rounded-md text-slate-500 hover:text-emerald-300 hover:bg-white/10" title="Editar"><Pencil size={15} /></button>
                                <button onClick={() => borrar(g.id)} className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-white/10" title="Borrar"><Trash2 size={15} /></button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-white/10 font-semibold border-t border-white/10">
                    <td className="px-4 py-3 text-white" colSpan={4}>Total</td>
                    <td className="px-4 py-3 text-right text-emerald-400 whitespace-nowrap">{eur(total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
