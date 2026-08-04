"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";

type BotEstado = {
  key: string;
  label: string;
  username: string;
  configurado: boolean;
  activos: number;
  total: number;
  escribieron: number;
  nuevos: number;
  ia: number;
  topeIa: number;
  qftd: number;
  ganado: number;
  ftd: number;
  recargas: number;
  promo: string;
};

export default function EstadoBotsPage() {
  const [bots, setBots] = useState<BotEstado[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  async function cargar() {
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
      const r = await fetch("/api/admin/bots", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      if (!r.ok) {
        setError(true);
        return;
      }
      const b = await r.json();
      setBots(b.bots ?? []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <main className="max-w-4xl mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-white">Estado de los bots</h1>
        <button
          onClick={cargar}
          disabled={cargando}
          className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
        >
          {cargando ? "Cargando…" : "Actualizar"}
        </button>
      </div>

      {cargando && !bots ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-amber-300">No se pudo cargar.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(bots ?? []).map((b) => {
            const pctIa = Math.min(100, Math.round((b.ia / b.topeIa) * 100));
            return (
              <div
                key={b.key}
                className="rounded-2xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-white truncate">{b.label}</p>
                    <p className="text-[11px] text-slate-400 truncate">{b.username}</p>
                  </div>
                  {!b.configurado && (
                    <span className="shrink-0 text-[10px] rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 px-1.5 py-0.5">
                      sin configurar
                    </span>
                  )}
                </div>

                {/* Contactos */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-300">{b.activos}</span>
                  <span className="text-xs text-slate-400">activos / {b.total} total</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-300">
                  <span>💬 {b.escribieron} escribieron hoy</span>
                  <span>✨ {b.nuevos} nuevos hoy</span>
                </div>

                {/* IA hoy */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>IA hoy</span>
                    <span>
                      {b.ia} / {b.topeIa}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        pctIa > 85 ? "bg-red-400" : pctIa > 50 ? "bg-amber-400" : "bg-emerald-400"
                      }`}
                      style={{ width: `${pctIa}%` }}
                    />
                  </div>
                </div>

                {/* Depósitos del bot */}
                <div className="rounded-lg bg-black/20 border border-white/10 p-2.5 grid grid-cols-3 gap-1 text-center">
                  <div>
                    <p className="text-sm font-bold text-emerald-300">{eur(b.ganado)}</p>
                    <p className="text-[10px] text-slate-400">ganado</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{b.qftd}</p>
                    <p className="text-[10px] text-slate-400">QFTD</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{b.recargas}</p>
                    <p className="text-[10px] text-slate-400">recargas</p>
                  </div>
                </div>

                {b.promo && (
                  <p className="text-[11px] text-slate-400 line-clamp-2">
                    📣 <span className="text-slate-300">{b.promo}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Depósitos por su afp (Sandro=bot, Jeffer=botmn, Alana=botdm). "Ganado" y
        "QFTD" son los depósitos cualificados; dependen de que FreshBet mande el afp.
      </p>
    </main>
  );
}
