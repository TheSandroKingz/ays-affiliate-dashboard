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
  { value: "claude_prog", label: "Claude (programación)", color: "#a855f7" },
  { value: "claude_bots", label: "Claude (bots)", color: "#38bdf8" },
  { value: "otros", label: "Otros", color: "#64748b" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.value, c])) as Record<
  string,
  { value: string; label: string; color: string }
>;
const QUIENES = [
  { value: "kingz", label: "Kingz (yo)", corto: "Kingz" },
  { value: "prz", label: "PRZ (socio)", corto: "PRZ" },
  { value: "comun", label: "Común", corto: "Común" },
];
const QUIEN_CORTO = Object.fromEntries(QUIENES.map((q) => [q.value, q.corto]));

const fechaMadrid = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

const input =
  "rounded-lg bg-white/10 border border-white/20 text-white text-base sm:text-sm px-3 py-2 [color-scheme:dark] placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function GastosPage() {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState("");

  const hoyStr = fechaMadrid(new Date());
  const [fecha, setFecha] = useState(hoyStr);
  const [categoria, setCategoria] = useState("publicidad");
  const [quien, setQuien] = useState("kingz");
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [guardando, setGuardando] = useState(false);

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

  async function añadir(e: React.FormEvent) {
    e.preventDefault();
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

  const total = datos?.total ?? 0;

  return (
    <main className="flex flex-col gap-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Gastos</h1>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={input}>
          {opciones.map((o) => (
            <option key={o.value} value={o.value} className="bg-black">{o.label}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] items-start">
        {/* Columna principal: añadir + lista */}
        <div className="flex flex-col gap-4 order-2 lg:order-1">
          <form onSubmit={añadir} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={input} />
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={input}>
              {CATS.map((c) => <option key={c.value} value={c.value} className="bg-black">{c.label}</option>)}
            </select>
            <select value={quien} onChange={(e) => setQuien(e.target.value)} className={input}>
              {QUIENES.map((q) => <option key={q.value} value={q.value} className="bg-black">{q.corto}</option>)}
            </select>
            <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto (opcional)" className={`${input} flex-1 min-w-[140px]`} />
            <input type="text" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="€" className={`${input} w-20`} />
            <button type="submit" disabled={guardando} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2">
              {guardando ? "…" : "Añadir"}
            </button>
          </form>

          {error && <p className="text-sm text-amber-300">{error}</p>}

          {cargando ? (
            <p className="text-sm text-slate-400">Cargando…</p>
          ) : !datos || datos.gastos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-12 text-center text-sm text-slate-500">
              No hay gastos en este período.
            </div>
          ) : (
            <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
              {datos.gastos.map((g) => {
                const c = CAT[g.categoria];
                return (
                  <div key={g.id} className="group flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="w-1 h-8 rounded-full shrink-0" style={{ background: c?.color ?? "#64748b" }} />
                    <span className="text-slate-500 w-12 shrink-0 tabular-nums">{g.fecha.slice(8)}/{g.fecha.slice(5, 7)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white truncate">{g.concepto || c?.label || g.categoria}</p>
                      <p className="text-xs text-slate-500">{c?.label || g.categoria} · {QUIEN_CORTO[g.quien] || g.quien}</p>
                    </div>
                    <span className="font-semibold text-white whitespace-nowrap tabular-nums">{eur(g.importe)}</span>
                    <button onClick={() => borrar(g.id)} className="text-slate-600 hover:text-red-400 text-lg leading-none px-1 opacity-0 group-hover:opacity-100 transition" title="Borrar">
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resumen (derecha) */}
        <aside className="order-1 lg:order-2 rounded-2xl border border-white/10 bg-white/5 p-5 lg:sticky lg:top-24">
          <p className="text-sm text-slate-400">Total del período</p>
          <p className="text-4xl font-bold text-white mt-1 mb-5 tabular-nums">{eur(total)}</p>

          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Quién ha puesto</p>
          <div className="flex flex-col gap-1.5 mb-5">
            {QUIENES.map((q) => (
              <div key={q.value} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{q.corto}</span>
                <span className="text-white tabular-nums">{eur(datos?.porQuien[q.value as keyof NonNullable<typeof datos>["porQuien"]] ?? 0)}</span>
              </div>
            ))}
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Por categoría</p>
          <div className="flex flex-col gap-1.5">
            {CATS.map((c) => (
              <div key={c.value} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                  {c.label}
                </span>
                <span className="text-white tabular-nums">{eur(datos?.porCategoria[c.value as keyof NonNullable<typeof datos>["porCategoria"]] ?? 0)}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
