"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";
import BotChatViewer from "@/components/BotChatViewer";

type MiBot = {
  tieneBot: boolean;
  bot?: string;
  ftd?: number;
  qftd?: number;
  ganado?: number;
  recargas?: number;
};

export default function MiBotTelegramPage() {
  const [data, setData] = useState<MiBot | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  // Solo los depósitos: las conversaciones las pinta el visor (BotChatViewer),
  // el MISMO estilo WhatsApp que usan el admin y Yaiza, pero limitado a su bot.
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError(false);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const t = session?.access_token;
        if (!t) {
          setError(true);
          return;
        }
        const r = await fetch("/api/telegram/mi-bot", {
          headers: { Authorization: "Bearer " + t },
        });
        if (!r.ok) {
          setError(true);
          return;
        }
        const dep = await r.json();
        if (vivo) setData(dep);
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
        Los depósitos que trae tu bot y las conversaciones con tus jugadores.
      </p>

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-amber-300">No se pudo cargar.</p>
      ) : !data?.tieneBot ? (
        <p className="text-sm text-slate-400">Aún no tienes un bot asignado.</p>
      ) : (
        <>
          {/* Depósitos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
              <p className="text-xs text-slate-300">Has ganado</p>
              <p className="text-2xl font-bold text-emerald-300">{eur(data.ganado ?? 0)}</p>
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

          {/* Conversaciones: mismo visor estilo WhatsApp que el admin/Yaiza. */}
          <BotChatViewer afiliado />
        </>
      )}
    </div>
  );
}
