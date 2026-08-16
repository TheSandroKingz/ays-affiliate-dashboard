"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  gastos: Gasto[];
  total: number;
  porQuien: { kingz: number; prz: number; comun: number };
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const CATS = [
  { value: "publicidad", label: "Publicidad", color: "#f59e0b" },
  { value: "claude_prog", label: "Claude (programación)", color: "#a855f7" },
  { value: "claude_bots", label: "Claude (bots)", color: "#38bdf8" },
  { value: "otros", label: "Otros", color: "#64748b" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.value, c])) as Record<
  string,
  { value: string; label: string; color: string }
>;
const QUIENES = [
  { value: "kingz", label: "Kingz", corto: "Kingz" },
  { value: "prz", label: "PRZ", corto: "PRZ" },
  { value: "comun", label: "Común", corto: "Común" },
];
const QUIEN_CORTO = Object.fromEntries(QUIENES.map((q) => [q.value, q.corto]));

const fechaMadrid = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
const ddmm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

// Celda editable de la fila de alta / edición.
const cell =
  "w-full rounded-md bg-white/10 border border-white/15 text-white text-sm px-2 py-1.5 [color-scheme:dark] placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export default function GastosPage() {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState("");
  const [orden, setOrden] = useState<{ campo: keyof Gasto; dir: "asc" | "desc" }>({
    campo: "fecha",
    dir: "desc",
  });

  // Fila de alta
  const hoyStr = fechaMadrid(new Date());
  const [fecha, setFecha] = useState(hoyStr);
  const [categoria, setCategoria] = useState("publicidad");
  const [quien, setQuien] = useState("kingz");
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Edición en línea
  const [editId, setEditId] = useState<number | null>(null);
  const [ed, setEd] = useState<Partial<Gasto>>({});

  const opciones = useMemo(() => {
    const hoy = new Date();
    const outs = [{ value: "", label: "Este mes" }];
    for (let i = 1; i <= 11; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      outs.push({ value: ym, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` });
    }
    outs.push({ value: "historico", label: "Histórico" });
    return outs;
  }, []);

  async function sesion() {
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
    const t = await sesion();
    if (!t) return;
    try {
      const q = periodo ? `?mes=${periodo}` : "";
      const r = await fetch(`/api/admin/gastos${q}`, {
        headers: { Authorization: "Bearer " + t },
      });
      if (!r.ok) return setError("No autorizado.");
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

  async function añadir() {
    const imp = Number(importe.replace(",", "."));
    if (!Number.isFinite(imp) || imp <= 0) return setError("Pon un importe válido.");
    setGuardando(true);
    setError(null);
    const t = await sesion();
    if (!t) return setGuardando(false);
    try {
      const r = await fetch("/api/admin/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ fecha, categoria, quien, concepto, importe: imp }),
      });
      if (!r.ok) return setError("No se pudo guardar.");
      setConcepto("");
      setImporte("");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEd() {
    if (editId == null) return;
    const imp = Number(String(ed.importe).replace(",", "."));
    if (!Number.isFinite(imp) || imp <= 0) return;
    const t = await sesion();
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
    const t = await sesion();
    if (!t) return;
    const r = await fetch(`/api/admin/gastos?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + t },
    });
    if (r.ok) await cargar();
  }

  function ordenarPor(campo: keyof Gasto) {
    setOrden((o) =>
      o.campo === campo
        ? { campo, dir: o.dir === "desc" ? "asc" : "desc" }
        : { campo, dir: campo === "importe" || campo === "fecha" ? "desc" : "asc" }
    );
  }
  const flecha = (campo: keyof Gasto) =>
    orden.campo === campo ? (orden.dir === "desc" ? " ↓" : " ↑") : "";

  const filas = useMemo(() => {
    const g = [...(datos?.gastos ?? [])];
    const dir = orden.dir === "asc" ? 1 : -1;
    g.sort((a, b) => {
      const av = a[orden.campo];
      const bv = b[orden.campo];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return g;
  }, [datos, orden]);

  const total = datos?.total ?? 0;
  const th =
    "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300 whitespace-nowrap";
  const td = "px-4 py-2.5 border-t border-white/5";

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Gastos</h1>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {opciones.map((o) => (
            <option key={o.value} value={o.value} className="bg-black">{o.label}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-amber-300">{error}</p>}

      <div className="bg-white/[0.04] border border-white/15 rounded-xl overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/[0.06] text-left">
              {(
                [
                  ["fecha", "Fecha", "left"],
                  ["categoria", "Categoría", "left"],
                  ["quien", "Quién", "left"],
                ] as [keyof Gasto, string, string][]
              ).map(([campo, label]) => (
                <th key={campo} className={th}>
                  <button onClick={() => ordenarPor(campo)} className="hover:text-white">
                    {label}{flecha(campo)}
                  </button>
                </th>
              ))}
              <th className={th}>Concepto</th>
              <th className={`${th} text-right`}>
                <button onClick={() => ordenarPor("importe")} className="hover:text-white">
                  Importe{flecha("importe")}
                </button>
              </th>
              <th className={`${th} w-10`}></th>
            </tr>
          </thead>

          <tbody>
            {/* Fila de alta (siempre arriba, tipo hoja de cálculo) */}
            <tr className="bg-emerald-500/[0.04]">
              <td className="px-3 py-2">
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={cell} />
              </td>
              <td className="px-3 py-2">
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={cell}>
                  {CATS.map((c) => <option key={c.value} value={c.value} className="bg-black">{c.label}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                <select value={quien} onChange={(e) => setQuien(e.target.value)} className={cell}>
                  {QUIENES.map((q) => <option key={q.value} value={q.value} className="bg-black">{q.corto}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto (opcional)" className={cell} />
              </td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={importe}
                  onChange={(e) => setImporte(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && añadir()}
                  placeholder="€"
                  className={`${cell} text-right`}
                />
              </td>
              <td className="px-2 py-2 text-center">
                <button
                  onClick={añadir}
                  disabled={guardando}
                  className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold w-8 h-8 leading-none"
                  title="Añadir"
                >
                  +
                </button>
              </td>
            </tr>

            {cargando ? (
              <tr><td colSpan={6} className={`${td} text-center text-slate-400`}>Cargando…</td></tr>
            ) : filas.length === 0 ? (
              <tr><td colSpan={6} className={`${td} text-center text-slate-500`}>No hay gastos en este período. Añade el primero arriba.</td></tr>
            ) : (
              filas.map((g, i) => {
                const c = CAT[g.categoria];
                const enEd = editId === g.id;
                return enEd ? (
                  <tr key={g.id} className="bg-white/[0.06]">
                    <td className="px-3 py-2">
                      <input type="date" value={ed.fecha ?? g.fecha} onChange={(e) => setEd((s) => ({ ...s, fecha: e.target.value }))} className={cell} />
                    </td>
                    <td className="px-3 py-2">
                      <select value={ed.categoria ?? g.categoria} onChange={(e) => setEd((s) => ({ ...s, categoria: e.target.value }))} className={cell}>
                        {CATS.map((x) => <option key={x.value} value={x.value} className="bg-black">{x.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={ed.quien ?? g.quien} onChange={(e) => setEd((s) => ({ ...s, quien: e.target.value }))} className={cell}>
                        {QUIENES.map((x) => <option key={x.value} value={x.value} className="bg-black">{x.corto}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={ed.concepto ?? g.concepto} onChange={(e) => setEd((s) => ({ ...s, concepto: e.target.value }))} className={cell} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" inputMode="decimal" value={ed.importe ?? g.importe} onChange={(e) => setEd((s) => ({ ...s, importe: e.target.value as unknown as number }))} onKeyDown={(e) => e.key === "Enter" && guardarEd()} className={`${cell} text-right`} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={guardarEd} className="text-emerald-400 hover:text-emerald-300 px-1" title="Guardar">✓</button>
                        <button onClick={() => { setEditId(null); setEd({}); }} className="text-slate-500 hover:text-white px-1" title="Cancelar">×</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={g.id}
                    className={`group cursor-pointer hover:bg-white/[0.04] ${i % 2 ? "bg-white/[0.015]" : ""}`}
                    onClick={() => { setEditId(g.id); setEd({ fecha: g.fecha, categoria: g.categoria, quien: g.quien, concepto: g.concepto, importe: g.importe }); }}
                  >
                    <td className={`${td} text-slate-400 tabular-nums whitespace-nowrap`}>{ddmm(g.fecha)}</td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-2 text-slate-200">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c?.color ?? "#64748b" }} />
                        {c?.label ?? g.categoria}
                      </span>
                    </td>
                    <td className={`${td} text-slate-300`}>{QUIEN_CORTO[g.quien] ?? g.quien}</td>
                    <td className={`${td} text-slate-300`}>{g.concepto || "—"}</td>
                    <td className={`${td} text-right font-semibold text-white tabular-nums whitespace-nowrap`}>{eur(g.importe)}</td>
                    <td className="px-2 py-2.5 text-center border-t border-white/5">
                      <button
                        onClick={(e) => { e.stopPropagation(); borrar(g.id); }}
                        className="text-slate-600 hover:text-red-400 text-lg leading-none opacity-0 group-hover:opacity-100 transition"
                        title="Borrar"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          <tfoot>
            <tr className="bg-white/[0.06] font-semibold border-t border-white/10">
              <td className="px-4 py-3 text-white" colSpan={4}>Total</td>
              <td className="px-4 py-3 text-right text-emerald-400 tabular-nums whitespace-nowrap">{eur(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {datos && (
        <p className="text-xs text-slate-500">
          Kingz {eur(datos.porQuien.kingz)} · PRZ {eur(datos.porQuien.prz)} · Común{" "}
          {eur(datos.porQuien.comun)} · Toca una fila para editarla.
        </p>
      )}
    </main>
  );
}
