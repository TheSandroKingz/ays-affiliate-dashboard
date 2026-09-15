"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TableSkeleton } from "@/components/Skeletons";
import LoadError from "@/components/LoadError";
import { eur } from "@/lib/format";

type Evento = {
  id: number;
  fecha: string;
  tipo: "registro" | "ftd";
  pais: string | null;
  ganado: number | null;
  porBot: boolean;
};

const madrid = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", ...opts }).format(new Date(iso));

export default function ActividadPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/account/actividad", {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const body = await res.json();
      setEventos(body.eventos ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <TableSkeleton title="Actividad" cols={4} />;
  if (loadError) return <LoadError onRetry={() => load()} />;

  const hoy = madrid(new Date().toISOString(), { year: "numeric", month: "2-digit", day: "2-digit" });
  const deHoy = eventos.filter(
    (e) => madrid(e.fecha, { year: "numeric", month: "2-digit", day: "2-digit" }) === hoy
  );
  const registrosHoy = deHoy.filter((e) => e.tipo === "registro").length;
  const ftdHoy = deHoy.filter((e) => e.tipo === "ftd");
  const ganadoHoy = ftdHoy.reduce((s, e) => s + Number(e.ganado ?? 0), 0);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Actividad</h1>
        <button
          onClick={async () => {
            setRefrescando(true);
            try {
              await load();
            } finally {
              setRefrescando(false);
            }
          }}
          disabled={refrescando}
          className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
        >
          <RefreshCw size={15} className={refrescando ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/15 bg-white/5 p-4">
          <p className="text-xs text-slate-400">Registros hoy</p>
          <p className="text-2xl font-bold text-white tabular-nums">{registrosHoy}</p>
        </div>
        <div className="rounded-xl border border-white/15 bg-white/5 p-4">
          <p className="text-xs text-slate-400">FTD hoy</p>
          <p className="text-2xl font-bold text-white tabular-nums">{ftdHoy.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4">
          <p className="text-xs text-slate-300">Ganado hoy</p>
          <p className="text-2xl font-bold text-emerald-300 tabular-nums">{eur(ganadoHoy)}</p>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">Fecha</th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">Qué ha pasado</th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">País</th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">Ganado</th>
            </tr>
          </thead>
          <tbody>
            {eventos.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-white/10 px-4 py-6 text-center text-slate-400">
                  Todavía no hay actividad en los últimos 30 días.
                </td>
              </tr>
            ) : (
              eventos.map((e, i) => (
                <tr key={e.id} className={`${i % 2 === 1 ? "bg-white/[0.03]" : ""} hover:bg-white/10 transition-colors`}>
                  <td className="border border-white/10 px-4 py-3 whitespace-nowrap tabular-nums">
                    {madrid(e.fecha, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="border border-white/10 px-4 py-3">
                    {e.tipo === "ftd" ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-xs font-semibold">
                        FTD
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-white/10 text-slate-200 px-2 py-0.5 text-xs font-semibold">
                        Registro
                      </span>
                    )}
                    {e.porBot && <span className="ml-2 text-xs text-slate-400">por tu bot</span>}
                  </td>
                  <td className="border border-white/10 px-4 py-3">{e.pais ?? "—"}</td>
                  <td className="border border-white/10 px-4 py-3 text-right tabular-nums">
                    {e.ganado != null ? <span className="text-emerald-300 font-medium">+{eur(e.ganado)}</span> : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
