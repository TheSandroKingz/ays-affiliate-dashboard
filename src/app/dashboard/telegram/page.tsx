"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";

type MiBot = {
  tieneBot: boolean;
  bot?: string;
  ftd?: number;
  qftd?: number;
  ganado?: number;
  recargas?: number;
  dineroRecargas?: number;
  recientes?: { fecha: string; pais: string | null; ganado: number }[];
};

export default function MiBotTelegramPage() {
  const [data, setData] = useState<MiBot | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError(false);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setError(true);
          return;
        }
        const r = await fetch("/api/telegram/mi-bot", {
          headers: { Authorization: "Bearer " + session.access_token },
        });
        if (!r.ok) {
          setError(true);
          return;
        }
        const b = await r.json();
        if (vivo) setData(b);
      } catch {
        if (vivo) setError(true);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Mi bot de Telegram</h1>
      <p className="text-sm text-slate-400 mb-6">
        Los depósitos que trae tu bot y lo que has ganado con ellos.
      </p>

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-amber-300">No se pudo cargar.</p>
      ) : !data?.tieneBot ? (
        <p className="text-sm text-slate-400">
          Aún no tienes un bot asignado. Cuando lo tengas, aquí verás sus
          depósitos.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
              <p className="text-xs text-slate-300">Has ganado</p>
              <p className="text-2xl font-bold text-emerald-300">
                {eur(data.ganado ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Depósitos cualificados</p>
              <p className="text-2xl font-bold text-white">{data.qftd ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Primeros depósitos</p>
              <p className="text-2xl font-bold text-white">{data.ftd ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Recargas</p>
              <p className="text-2xl font-bold text-white">{data.recargas ?? 0}</p>
            </div>
          </div>

          {data.recientes && data.recientes.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="grid grid-cols-[1fr_.6fr_.6fr] gap-2 px-4 py-3 text-xs font-medium text-slate-400 border-b border-white/10">
                <span>Fecha</span>
                <span className="text-center">País</span>
                <span className="text-right">Ganaste</span>
              </div>
              {data.recientes.map((d, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_.6fr_.6fr] gap-2 px-4 py-3 text-sm border-b border-white/5 last:border-0"
                >
                  <span className="text-slate-300">
                    {new Date(d.fecha).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-center text-slate-300">
                    {d.pais || "—"}
                  </span>
                  <span className="text-right text-emerald-300">
                    {eur(d.ganado)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Aún no hay depósitos cualificados de tu bot. En cuanto entren, los
              verás aquí.
            </p>
          )}
        </>
      )}
    </div>
  );
}
