"use client";

import { useEffect, useState } from "react";
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

export default function RepartoPage() {
  const [reparto, setReparto] = useState<Reparto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setError("Inicia sesión.");
          return;
        }
        const r = await fetch("/api/admin/overview", {
          headers: { Authorization: "Bearer " + session.access_token },
        });
        if (!r.ok) {
          setError("No autorizado.");
          return;
        }
        const b = await r.json();
        setReparto(b.reparto ?? null);
      } catch {
        setError("No se pudo cargar.");
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Reparto con el socio</h1>
      <p className="text-sm text-slate-400 mb-6">
        Cómo se reparten las ganancias (el margen que sobra tras pagar a cada
        afiliado) este mes. Se reinicia cada mes.
      </p>

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-amber-300">{error}</p>
      ) : !reparto || reparto.fuentes.length === 0 ? (
        <p className="text-sm text-slate-400">Aún no hay ganancias este mes.</p>
      ) : (
        <>
          {/* Totales de cada uno */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5">
              <p className="text-sm text-slate-300">Tú (Sandro)</p>
              <p className="text-3xl font-bold text-emerald-300">
                {eur(reparto.sandroTotal)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
              <p className="text-sm text-slate-300">Socio</p>
              <p className="text-3xl font-bold text-white">
                {eur(reparto.socioTotal)}
              </p>
            </div>
          </div>

          {/* Desglose por fuente */}
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="grid grid-cols-[1.4fr_.6fr_1fr_1fr_1fr] gap-2 px-4 py-3 text-xs font-medium text-slate-400 border-b border-white/10">
              <span>Fuente</span>
              <span className="text-right">FTD</span>
              <span className="text-right">Ganancia</span>
              <span className="text-right">Tú</span>
              <span className="text-right">Socio</span>
            </div>
            {reparto.fuentes.map((f) => (
              <div
                key={f.nombre}
                className="grid grid-cols-[1.4fr_.6fr_1fr_1fr_1fr] gap-2 px-4 py-3 text-sm border-b border-white/5 last:border-0"
              >
                <span className="text-white">{f.nombre}</span>
                <span className="text-right text-slate-300">{f.ftd}</span>
                <span className="text-right text-slate-300">
                  {eur(f.ganancia)}
                </span>
                <span className="text-right text-emerald-300">
                  {eur(f.sandro)}{" "}
                  <span className="text-[10px] text-slate-500">
                    ({f.pctSandro}%)
                  </span>
                </span>
                <span className="text-right text-slate-200">
                  {eur(f.socio)}{" "}
                  <span className="text-[10px] text-slate-500">
                    ({f.pctSocio}%)
                  </span>
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
