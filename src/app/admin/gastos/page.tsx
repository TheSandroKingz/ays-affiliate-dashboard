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
  { value: "publicidad", label: "Publicidad" },
  { value: "claude_prog", label: "Claude (programación)" },
  { value: "claude_bots", label: "Claude (bots)" },
  { value: "otros", label: "Otros" },
];
const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.value, c.label]));
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

  return (
    <main className="flex flex-col gap-5 max-w-3xl">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Gastos</h1>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={input}>
          {opciones.map((o) => (
            <option key={o.value} value={o.value} className="bg-black">{o.label}</option>
          ))}
        </select>
      </div>

      {/* Total */}
      <div className="rounded-xl border border-white/15 bg-white/5 p-5">
        <p className="text-sm text-slate-400">Total del período</p>
        <p className="text-3xl font-bold text-white mt-1">{eur(datos?.total ?? 0)}</p>
        {datos && (
          <p className="text-xs text-slate-500 mt-2">
            Kingz {eur(datos.porQuien.kingz)} · PRZ {eur(datos.porQuien.prz)} · Común{" "}
            {eur(datos.porQuien.comun)}
          </p>
        )}
      </div>

      {/* Añadir */}
      <form onSubmit={añadir} className="flex flex-wrap items-end gap-2">
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

      {/* Lista */}
      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : !datos || datos.gastos.length === 0 ? (
        <p className="text-sm text-slate-400">No hay gastos en este período.</p>
      ) : (
        <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
          {datos.gastos.map((g) => (
            <div key={g.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="text-slate-500 w-12 shrink-0">{g.fecha.slice(8)}/{g.fecha.slice(5, 7)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white truncate">
                  {g.concepto || CAT_LABEL[g.categoria] || g.categoria}
                </p>
                <p className="text-xs text-slate-500">
                  {CAT_LABEL[g.categoria] || g.categoria} · {QUIEN_CORTO[g.quien] || g.quien}
                </p>
              </div>
              <span className="font-semibold text-white whitespace-nowrap">{eur(g.importe)}</span>
              <button onClick={() => borrar(g.id)} className="text-slate-600 hover:text-red-400 text-lg leading-none px-1" title="Borrar">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
