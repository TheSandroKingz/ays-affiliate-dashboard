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
type Datos = { gastos: Gasto[]; total: number };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Cada categoría reparte el gasto entre Kingz (tú) y PRZ (socio) por %.
// Publicidad 65/35 (como el reparto de ganancias); dashboard y bots a medias
// (es infraestructura para los dos).
const CATS = [
  { value: "publicidad", label: "Publicidad", color: "#f59e0b", kingz: 65, prz: 35 },
  { value: "claude_prog", label: "Claude (dashboard)", color: "#a855f7", kingz: 50, prz: 50 },
  { value: "claude_bots", label: "Claude (bots)", color: "#38bdf8", kingz: 50, prz: 50 },
  { value: "otros", label: "Otros", color: "#64748b", kingz: 50, prz: 50 },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.value, c])) as Record<
  string,
  (typeof CATS)[number]
>;

const fechaMadrid = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
const ddmm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;
const parteKingz = (g: { categoria: string; importe: number }) =>
  (g.importe * (CAT[g.categoria]?.kingz ?? 50)) / 100;
const partePrz = (g: { categoria: string; importe: number }) =>
  (g.importe * (CAT[g.categoria]?.prz ?? 50)) / 100;

const cell =
  "w-full rounded-md bg-white/10 border border-white/15 text-white text-sm px-2 py-1.5 [color-scheme:dark] placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export default function GastosPage() {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState("");

  const hoyStr = fechaMadrid(new Date());
  const [fecha, setFecha] = useState(hoyStr);
  const [categoria, setCategoria] = useState("publicidad");
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [guardando, setGuardando] = useState(false);

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
        body: JSON.stringify({ fecha, categoria, quien: "comun", concepto, importe: imp }),
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
      body: JSON.stringify({
        id: editId,
        fecha: ed.fecha,
        categoria: ed.categoria,
        concepto: ed.concepto,
        importe: imp,
      }),
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

  const gastos = datos?.gastos ?? [];
  const total = datos?.total ?? 0;
  const totalKingz = gastos.reduce((s, g) => s + parteKingz(g), 0);
  const totalPrz = gastos.reduce((s, g) => s + partePrz(g), 0);

  const th = "px-4 py-3 text-xs font-medium text-slate-400 whitespace-nowrap";

  return (
    <main className="flex flex-col gap-5">
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

      {/* Lo que le toca poner a cada uno */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5">
          <p className="text-sm text-slate-300">Tú (Kingz)</p>
          <p className="text-3xl font-bold text-emerald-300 tabular-nums">{eur(totalKingz)}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
          <p className="text-sm text-slate-300">Socio (PRZ)</p>
          <p className="text-3xl font-bold text-white tabular-nums">{eur(totalPrz)}</p>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        El reparto se calcula solo según la categoría: <b className="text-slate-400">Publicidad</b> 65% tú / 35% socio;{" "}
        <b className="text-slate-400">Claude (dashboard y bots)</b> y <b className="text-slate-400">Otros</b> a medias.
      </p>

      {error && <p className="text-sm text-amber-300">{error}</p>}

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[680px]">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className={th}>Fecha</th>
              <th className={th}>Categoría</th>
              <th className={th}>Concepto</th>
              <th className={`${th} text-right`}>Importe</th>
              <th className={`${th} text-right`}>Kingz</th>
              <th className={`${th} text-right`}>PRZ</th>
              <th className={`${th} w-8`}></th>
            </tr>
          </thead>

          <tbody>
            {/* Fila para añadir */}
            <tr className="bg-emerald-500/[0.04] border-b border-white/10">
              <td className="px-3 py-2">
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={cell} />
              </td>
              <td className="px-3 py-2">
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={cell}>
                  {CATS.map((c) => <option key={c.value} value={c.value} className="bg-black">{c.label}</option>)}
                </select>
              </td>
              <td className="px-3 py-2">
                <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto (opcional)" className={cell} />
              </td>
              <td className="px-3 py-2">
                <input type="text" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} onKeyDown={(e) => e.key === "Enter" && añadir()} placeholder="€" className={`${cell} text-right`} />
              </td>
              <td className="px-3 py-2 text-right text-xs text-slate-500">{CAT[categoria]?.kingz}%</td>
              <td className="px-3 py-2 text-right text-xs text-slate-500">{CAT[categoria]?.prz}%</td>
              <td className="px-2 py-2 text-center">
                <button onClick={añadir} disabled={guardando} className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold w-8 h-8 leading-none" title="Añadir">+</button>
              </td>
            </tr>

            {cargando ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>
            ) : gastos.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No hay gastos en este período. Añade el primero arriba.</td></tr>
            ) : (
              gastos.map((g) => {
                const c = CAT[g.categoria];
                if (editId === g.id) {
                  return (
                    <tr key={g.id} className="bg-white/[0.06] border-b border-white/5">
                      <td className="px-3 py-2">
                        <input type="date" value={ed.fecha ?? g.fecha} onChange={(e) => setEd((s) => ({ ...s, fecha: e.target.value }))} className={cell} />
                      </td>
                      <td className="px-3 py-2">
                        <select value={ed.categoria ?? g.categoria} onChange={(e) => setEd((s) => ({ ...s, categoria: e.target.value }))} className={cell}>
                          {CATS.map((x) => <option key={x.value} value={x.value} className="bg-black">{x.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={ed.concepto ?? g.concepto} onChange={(e) => setEd((s) => ({ ...s, concepto: e.target.value }))} className={cell} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" inputMode="decimal" value={ed.importe ?? g.importe} onChange={(e) => setEd((s) => ({ ...s, importe: e.target.value as unknown as number }))} onKeyDown={(e) => e.key === "Enter" && guardarEd()} className={`${cell} text-right`} />
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-slate-500">{CAT[ed.categoria ?? g.categoria]?.kingz}%</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-500">{CAT[ed.categoria ?? g.categoria]?.prz}%</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={guardarEd} className="text-emerald-400 hover:text-emerald-300 px-1" title="Guardar">✓</button>
                          <button onClick={() => { setEditId(null); setEd({}); }} className="text-slate-500 hover:text-white px-1" title="Cancelar">×</button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={g.id}
                    className="group cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.04]"
                    onClick={() => { setEditId(g.id); setEd({ fecha: g.fecha, categoria: g.categoria, concepto: g.concepto, importe: g.importe }); }}
                  >
                    <td className="px-4 py-3 text-slate-400 tabular-nums whitespace-nowrap">{ddmm(g.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-slate-200">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c?.color ?? "#64748b" }} />
                        {c?.label ?? g.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{g.concepto || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white tabular-nums whitespace-nowrap">{eur(g.importe)}</td>
                    <td className="px-4 py-3 text-right text-emerald-300 tabular-nums whitespace-nowrap">
                      {eur(parteKingz(g))}{" "}
                      <span className="text-[10px] text-slate-500">({c?.kingz ?? 50}%)</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200 tabular-nums whitespace-nowrap">
                      {eur(partePrz(g))}{" "}
                      <span className="text-[10px] text-slate-500">({c?.prz ?? 50}%)</span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button onClick={(e) => { e.stopPropagation(); borrar(g.id); }} className="text-slate-600 hover:text-red-400 text-lg leading-none opacity-0 group-hover:opacity-100 transition" title="Borrar">×</button>
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
                <td className="px-4 py-3 text-right text-emerald-300 tabular-nums whitespace-nowrap">{eur(totalKingz)}</td>
                <td className="px-4 py-3 text-right text-slate-200 tabular-nums whitespace-nowrap">{eur(totalPrz)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-slate-500">Toca una fila para editarla.</p>
    </main>
  );
}
