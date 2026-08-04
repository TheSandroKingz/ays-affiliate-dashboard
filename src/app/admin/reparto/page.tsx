"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";

type Fuente = {
  nombre: string;
  ftd: number;
  ganancia: number;
  pctSandro: number;
  pctSocio: number;
  sandro: number;
  socio: number;
};
type Reparto = { fuentes: Fuente[]; sandroTotal: number; socioTotal: number };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default function RepartoPage() {
  const [reparto, setReparto] = useState<Reparto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "" = mes actual · "YYYY-MM" = un mes · "historico" = todo · "dia:YYYY-MM-DD" = un día
  const [periodo, setPeriodo] = useState("");

  const fechaISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const hoyStr = fechaISO(new Date());
  const ayerD = new Date();
  ayerD.setDate(ayerD.getDate() - 1);
  const ayerStr = fechaISO(ayerD);

  // Opciones del selector: Hoy, Ayer, este mes + los 11 anteriores + histórico.
  const opciones = useMemo(() => {
    const hoy = new Date();
    const outs: { value: string; label: string }[] = [
      { value: `dia:${hoyStr}`, label: "Hoy" },
      { value: `dia:${ayerStr}`, label: "Ayer" },
      { value: "", label: "Este mes" },
    ];
    for (let i = 1; i <= 11; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      outs.push({ value: ym, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` });
    }
    outs.push({ value: "historico", label: "Histórico (todo)" });
    return outs;
  }, [hoyStr, ayerStr]);

  // Si hay un día concreto elegido con el calendario que no está en la lista, lo
  // añadimos como opción para que el selector lo muestre bien.
  const opcionesFinal = useMemo(() => {
    if (periodo.startsWith("dia:") && !opciones.some((o) => o.value === periodo)) {
      return [{ value: periodo, label: periodo.slice(4) }, ...opciones];
    }
    return opciones;
  }, [periodo, opciones]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setError("Inicia sesión.");
          return;
        }
        const q = periodo.startsWith("dia:")
          ? `?dia=${periodo.slice(4)}`
          : periodo
          ? `?mes=${periodo}`
          : "";
        const r = await fetch(`/api/admin/reparto${q}`, {
          headers: { Authorization: "Bearer " + session.access_token },
        });
        if (!r.ok) {
          setError("No autorizado.");
          return;
        }
        const b = await r.json();
        if (vivo) setReparto(b.reparto ?? null);
      } catch {
        if (vivo) setError("No se pudo cargar.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [periodo]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-white">Reparto con el socio</h1>
        <div className="flex items-center gap-2">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400/50"
          >
            {opcionesFinal.map((o) => (
              <option key={o.value} value={o.value} className="bg-black">
                {o.label}
              </option>
            ))}
          </select>
          {/* Un día concreto (calendario). */}
          <input
            type="date"
            max={hoyStr}
            value={periodo.startsWith("dia:") ? periodo.slice(4) : ""}
            onChange={(e) => e.target.value && setPeriodo(`dia:${e.target.value}`)}
            title="Ver un día concreto"
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm text-white focus:outline-none focus:border-emerald-400/50 [color-scheme:dark]"
          />
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Cómo se reparten las ganancias (el margen que sobra tras pagar a cada
        afiliado) en el período elegido.
      </p>

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-amber-300">{error}</p>
      ) : !reparto || reparto.fuentes.length === 0 ? (
        <p className="text-sm text-slate-400">No hay ganancias en este período.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5">
              <p className="text-sm text-slate-300">Kingz</p>
              <p className="text-3xl font-bold text-emerald-300">
                {eur(reparto.sandroTotal)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
              <p className="text-sm text-slate-300">PRZ</p>
              <p className="text-3xl font-bold text-white">
                {eur(reparto.socioTotal)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="grid grid-cols-[1.4fr_.6fr_1fr_1fr_1fr] gap-2 px-4 py-3 text-xs font-medium text-slate-400 border-b border-white/10">
              <span>Fuente</span>
              <span className="text-right">FTD</span>
              <span className="text-right">Ganancia</span>
              <span className="text-right">Kingz</span>
              <span className="text-right">PRZ</span>
            </div>
            {reparto.fuentes.map((f) => (
              <div
                key={f.nombre}
                className="grid grid-cols-[1.4fr_.6fr_1fr_1fr_1fr] gap-2 px-4 py-3 text-sm border-b border-white/5 last:border-0"
              >
                <span className="text-white">{f.nombre}</span>
                <span className="text-right text-slate-300">{f.ftd}</span>
                <span className="text-right text-slate-300">{eur(f.ganancia)}</span>
                <span className="text-right text-emerald-300">
                  {eur(f.sandro)}{" "}
                  <span className="text-[10px] text-slate-500">({f.pctSandro}%)</span>
                </span>
                <span className="text-right text-slate-200">
                  {eur(f.socio)}{" "}
                  <span className="text-[10px] text-slate-500">({f.pctSocio}%)</span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            El reparto se hace sobre la ganancia (lo que sobra tras pagar el CPA
            de cada afiliado), no sobre el total bruto.
          </p>
        </>
      )}
    </div>
  );
}
