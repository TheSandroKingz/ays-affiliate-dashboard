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
  etiqueta: string;
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

const CATS: { value: string; label: string }[] = [
  { value: "publicidad", label: "Publicidad" },
  { value: "claude_prog", label: "Claude (programación)" },
  { value: "claude_bots", label: "Claude (bots)" },
  { value: "otros", label: "Otros" },
];
const CAT_LABEL: Record<string, string> = Object.fromEntries(
  CATS.map((c) => [c.value, c.label])
);
const QUIENES: { value: string; label: string }[] = [
  { value: "kingz", label: "Kingz (yo)" },
  { value: "prz", label: "PRZ (socio)" },
  { value: "comun", label: "Común" },
];
const QUIEN_LABEL: Record<string, string> = {
  kingz: "Kingz",
  prz: "PRZ",
  comun: "Común",
};

const fechaMadrid = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

export default function GastosPage() {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(""); // "" = este mes · "YYYY-MM" · "historico"

  // Formulario de alta
  const hoyStr = fechaMadrid(new Date());
  const [fecha, setFecha] = useState(hoyStr);
  const [categoria, setCategoria] = useState("publicidad");
  const [quien, setQuien] = useState("kingz");
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [guardando, setGuardando] = useState(false);

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

  async function cargar() {
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
        return;
      }
      const q = periodo ? `?mes=${periodo}` : "";
      const r = await fetch(`/api/admin/gastos${q}`, {
        headers: { Authorization: "Bearer " + session.access_token },
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/admin/gastos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({ fecha, categoria, quien, concepto, importe: imp }),
      });
      if (!r.ok) {
        setError("No se pudo guardar.");
        return;
      }
      setConcepto("");
      setImporte("");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: number) {
    if (!confirm("¿Borrar este gasto?")) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const r = await fetch(`/api/admin/gastos?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + session.access_token },
    });
    if (r.ok) await cargar();
  }

  const inputCls =
    "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400/50";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-white">Gastos</h1>
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
      <p className="text-sm text-slate-400 mb-6">
        Anota aquí los gastos del negocio (publicidad, Claude, etc.) para que hacer
        cuentas cada mes sea fácil. Importes en euros.
      </p>

      {/* Formulario de alta */}
      <form
        onSubmit={añadir}
        className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-6 grid gap-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto_auto] sm:items-end"
      >
        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Categoría</span>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={inputCls}
          >
            {CATS.map((c) => (
              <option key={c.value} value={c.value} className="bg-black">
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Quién</span>
          <select
            value={quien}
            onChange={(e) => setQuien(e.target.value)}
            className={inputCls}
          >
            {QUIENES.map((q) => (
              <option key={q.value} value={q.value} className="bg-black">
                {q.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Concepto (opcional)</span>
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="ej. anuncio TikTok"
            className={inputCls}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Importe €</span>
          <input
            type="text"
            inputMode="decimal"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            placeholder="0"
            className={`${inputCls} w-24`}
          />
        </label>
        <button
          type="submit"
          disabled={guardando}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap"
        >
          {guardando ? "…" : "Añadir"}
        </button>
      </form>

      {error && <p className="text-sm text-amber-300 mb-4">{error}</p>}

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : !datos ? (
        <p className="text-sm text-slate-400">No se pudo cargar.</p>
      ) : (
        <>
          {/* Totales */}
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5 mb-3">
            <p className="text-sm text-slate-300">Total del período</p>
            <p className="text-3xl font-bold text-emerald-300">{eur(datos.total)}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-400">Kingz (yo)</p>
              <p className="text-xl font-bold text-white">{eur(datos.porQuien.kingz)}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-400">PRZ (socio)</p>
              <p className="text-xl font-bold text-white">{eur(datos.porQuien.prz)}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-400">Común</p>
              <p className="text-xl font-bold text-white">{eur(datos.porQuien.comun)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {CATS.map((c) => (
              <div key={c.value} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-slate-400">{c.label}</p>
                <p className="text-lg font-semibold text-slate-200">
                  {eur(datos.porCategoria[c.value as keyof typeof datos.porCategoria])}
                </p>
              </div>
            ))}
          </div>

          {/* Lista de gastos */}
          {datos.gastos.length === 0 ? (
            <p className="text-sm text-slate-400">No hay gastos anotados en este período.</p>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="grid grid-cols-[.8fr_1fr_.7fr_1.4fr_.8fr_auto] gap-2 px-4 py-3 text-xs font-medium text-slate-400 border-b border-white/10">
                <span>Fecha</span>
                <span>Categoría</span>
                <span>Quién</span>
                <span>Concepto</span>
                <span className="text-right">Importe</span>
                <span></span>
              </div>
              {datos.gastos.map((g) => (
                <div
                  key={g.id}
                  className="grid grid-cols-[.8fr_1fr_.7fr_1.4fr_.8fr_auto] gap-2 px-4 py-3 text-sm border-b border-white/5 last:border-0 items-center"
                >
                  <span className="text-slate-300">{g.fecha.slice(5)}</span>
                  <span className="text-slate-200">{CAT_LABEL[g.categoria] ?? g.categoria}</span>
                  <span className="text-slate-400">{QUIEN_LABEL[g.quien] ?? g.quien}</span>
                  <span className="text-slate-300 truncate">{g.concepto || "—"}</span>
                  <span className="text-right text-white">{eur(g.importe)}</span>
                  <button
                    onClick={() => borrar(g.id)}
                    className="text-slate-500 hover:text-red-400 text-xs px-1"
                    title="Borrar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
