"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";
import { cuentasGanancias, colorDe, repartoIgual, type ConfigGastos } from "@/lib/repartoGastos";

// REPARTO CON LOS SOCIOS, para los afiliados que trabajan en equipo. Es lo mismo
// que el admin tiene con su socio: lo ganado en el periodo y cuánto le toca a cada
// uno. Los socios salen de su configuración de Gastos; lo primero que se les pide
// aquí es el % de GANANCIAS, que no tiene por qué ser el mismo que el de los gastos.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const campo =
  "w-20 rounded-md bg-white/10 border border-white/15 text-white text-base sm:text-sm px-2 py-1.5 text-right [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-emerald-500";
const aTexto = (n: number) => String(n).replace(".", ",");

type Datos = { ganado: number; ftd: number; gastado: number; config: ConfigGastos | null; mesVista: string | null };

export default function RepartoAfiliadoPage() {
  const [periodo, setPeriodo] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date()).slice(0, 7)
  );
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [pcts, setPcts] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const reqRef = useRef(0);

  const opciones = useMemo(() => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
    const [y, m] = hoy.split("-").map(Number);
    const out: { value: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const mes = MESES[d.getUTCMonth()];
      out.push({
        value: d.toISOString().slice(0, 7),
        label: i === 0 ? "Este mes" : `${mes.charAt(0).toUpperCase() + mes.slice(1)} ${d.getUTCFullYear()}`,
      });
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
      const r = await fetch(`/api/account/reparto?mes=${periodo}`, { headers: { Authorization: "Bearer " + t } });
      const b = await r.json().catch(() => ({}));
      if (reqId !== reqRef.current) return;
      if (!r.ok) { setError(b?.error || "No se pudo cargar."); return; }
      setDatos(b);
    } catch {
      if (reqId === reqRef.current) setError("No se pudo cargar. Revisa tu conexión.");
    } finally {
      if (reqId === reqRef.current) setCargando(false);
    }
  }, [periodo]);

  useEffect(() => { setCargando(true); cargar(); }, [cargar]);

  const config = datos?.config ?? null;
  const socios = config?.socios ?? [];
  const esEquipo = socios.length >= 2;
  const tienePcts = !!config?.ganancias?.length;

  // Al llegar la configuración, preparamos los % para editarlos (los suyos o a partes iguales).
  useEffect(() => {
    if (!config || !esEquipo) return;
    setPcts(
      config.ganancias?.length
        ? config.ganancias.map(aTexto)
        : repartoIgual(config.socios.length).map(aTexto)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos]);

  async function guardarPcts() {
    if (!config) return;
    setError(null);
    setGuardando(true);
    try {
      const t = await token();
      if (!t) { setError("Sesión caducada."); return; }
      const r = await fetch("/api/account/gastos", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ config: { ...config, ganancias: pcts } }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setError(b?.error || "No se pudo guardar."); return; }
      setDatos((d) => (d ? { ...d, config: b.config ?? d.config } : d));
      setEditando(false);
    } catch {
      setError("No se pudo guardar. Revisa tu conexión.");
    } finally {
      setGuardando(false);
    }
  }

  const ganado = datos?.ganado ?? 0;
  const gastado = datos?.gastado ?? 0;
  const filas = config && esEquipo && tienePcts ? cuentasGanancias(ganado, config) : [];
  const sumaPcts = pcts.reduce((s, p) => s + (Number(p.replace(",", ".")) || 0), 0);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Reparto con tus socios</h1>
          <p className="text-sm text-slate-400 mt-1">
            Cómo se reparte lo que habéis ganado en el período elegido.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {esEquipo && tienePcts && !editando && (
            <button
              onClick={() => setEditando(true)}
              className="rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-medium px-4 py-2 transition"
            >
              Cambiar %
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

      {error && <p className="text-sm text-amber-300">{error}</p>}

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : !esEquipo ? (
        // Trabaja solo (o aún no ha puesto a nadie): esto es solo para equipos.
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-white font-medium">Esto es para cuando trabajáis en equipo.</p>
          <p className="text-sm text-slate-400 mt-1">
            Pon a tus socios en{" "}
            <Link href="/dashboard/gastos" className="text-emerald-400 hover:text-emerald-300">
              Gastos
            </Link>{" "}
            y aquí verás cuánto le toca a cada uno de lo que ganáis.
          </p>
        </div>
      ) : !tienePcts || editando ? (
        // Lo primero: qué % de las ganancias se lleva cada uno.
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
          <div>
            <p className="text-white font-medium">¿Qué % de lo que ganáis se lleva cada uno?</p>
            <p className="text-sm text-slate-400 mt-1">
              Es solo para las ganancias. Los gastos siguen con los % que tenéis puestos en Gastos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {socios.map((s, i) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorDe(s) }} />
                <span className="text-slate-200">{s}</span>
                <input
                  value={pcts[i] ?? ""}
                  inputMode="decimal"
                  onChange={(e) => setPcts((prev) => socios.map((_, k) => (k === i ? e.target.value : prev[k] ?? "")))}
                  className={campo}
                />
                <span className="text-slate-500">%</span>
              </label>
            ))}
            <div className="flex items-center gap-3 text-xs">
              <button
                onClick={() => setPcts(repartoIgual(socios.length).map(aTexto))}
                className="text-emerald-400 hover:text-emerald-300"
              >
                A partes iguales
              </button>
              <span className={`tabular-nums ${Math.abs(sumaPcts - 100) <= 0.05 ? "text-slate-500" : "text-amber-300"}`}>
                Suma {aTexto(Math.round(sumaPcts * 100) / 100)} %
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={guardarPcts}
              disabled={guardando}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 min-h-[44px]"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {tienePcts && (
              <button
                onClick={() => setEditando(false)}
                className="rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm px-4 py-2 min-h-[44px]"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Una tarjeta por socio, con su color, como Kingz/PRZ en el del admin. */}
          <div className="grid grid-cols-2 gap-3">
            {filas.map((f) => (
              <div
                key={f.nombre}
                className="rounded-2xl border p-5"
                style={{ borderColor: `${colorDe(f.nombre)}66`, background: `${colorDe(f.nombre)}1a` }}
              >
                <p className="text-sm text-slate-300">
                  {f.nombre} <span className="text-slate-500">· {f.pct.toLocaleString("es-ES")}%</span>
                </p>
                <p className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: colorDe(f.nombre) }}>
                  {eur(f.importe)}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[420px]">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-slate-400">Socio</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-400 text-right">%</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-400 text-right">Le toca</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.nombre} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorDe(f.nombre) }} />
                        <span className="text-white">{f.nombre}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                      {f.pct.toLocaleString("es-ES")}%
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: colorDe(f.nombre) }}>
                      {eur(f.importe)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.04] font-semibold">
                  <td className="px-4 py-3 text-white" colSpan={2}>Ganado en el período</td>
                  <td className="px-4 py-3 text-right text-white tabular-nums">{eur(ganado)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            Se reparte lo GANADO ({eur(ganado)}), sin tocar los gastos. En el período llevas{" "}
            <Link href="/dashboard/gastos" className="text-slate-400 hover:text-slate-200">
              {eur(gastado)} de gastos
            </Link>
            , que se reparten con sus propios % ahí. Estos % son solo de las ganancias.
          </p>
        </>
      )}
    </main>
  );
}
