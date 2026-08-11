"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
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
  bajas: number;
  dormidos: number;
  ia: number;
  topeIa: number;
  registros: number;
  qftd: number;
  ganado: number;
  recargas: number;
  depositado: number;
  mensajes: number;
  promo: string;
};

export default function EstadoBotsPage() {
  const router = useRouter();
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
      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
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

  // Cambia el nombre VISIBLE del bot en Telegram (no el @usuario, eso es BotFather).
  async function renombrar(key: string, actual: string) {
    const nombre = window.prompt(
      `Nuevo nombre visible en Telegram (el de arriba del chat). No cambia el @usuario.`,
      actual
    );
    if (!nombre || !nombre.trim()) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const r = await fetch("/api/admin/rename-bot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ key, name: nombre.trim() }),
    });
    const j = await r.json().catch(() => ({}));
    alert(
      r.ok
        ? `Nombre cambiado a "${j.name}". Puede tardar un momento en verse en Telegram.`
        : `No se pudo: ${j.error || "error"}`
    );
  }

  return (
    <main className="flex flex-col gap-4">
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
                    {b.configurado && (
                      <button
                        onClick={() => renombrar(b.key, b.label)}
                        className="mt-1 text-[10px] text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
                      >
                        ✏️ Renombrar en Telegram
                      </button>
                    )}
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
                  <span className="text-xs text-slate-400">personas activas (de {b.total})</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-300">
                  <span>
                    Escribieron hoy: <b className="text-white">{b.escribieron}</b>
                  </span>
                  <span>
                    Nuevos hoy: <b className="text-white">{b.nuevos}</b>
                  </span>
                  <span>
                    Llevan días sin hablar: <b className="text-white">{b.dormidos}</b>
                  </span>
                  <span>
                    Se dieron de baja: <b className="text-white">{b.bajas}</b>
                  </span>
                </div>

                {/* IA hoy */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Respuestas de la IA hoy</span>
                    <span>
                      {b.ia} de {b.topeIa}
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

                {/* Recorrido: se registraron → depósitos que pagan */}
                <div className="grid grid-cols-2 gap-1 text-center text-xs">
                  <div className="rounded-lg bg-white/5 py-1.5">
                    <p className="font-bold text-white">{b.registros}</p>
                    <p className="text-[10px] text-slate-400">se registraron</p>
                  </div>
                  <div className="rounded-lg bg-white/5 py-1.5">
                    <p className="font-bold text-white">{b.qftd}</p>
                    <p className="text-[10px] text-slate-400">depósitos que pagan</p>
                  </div>
                </div>

                {/* Dinero + recargas + depositado */}
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-400/30 p-2.5 grid grid-cols-3 gap-1 text-center">
                  <div>
                    <p className="text-base font-bold text-emerald-300">{eur(b.ganado)}</p>
                    <p className="text-[10px] text-slate-400">has ganado</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">{eur(b.depositado)}</p>
                    <p className="text-[10px] text-slate-400">depositado</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">{b.recargas}</p>
                    <p className="text-[10px] text-slate-400">recargas</p>
                  </div>
                </div>

                <div className="flex justify-between text-[11px] text-slate-500 border-t border-white/5 pt-2">
                  <span>{b.mensajes.toLocaleString("es-ES")} mensajes en total</span>
                  {b.registros > 0 && (
                    <span>
                      Conversión: {Math.round((b.qftd / b.registros) * 100)}%
                    </span>
                  )}
                </div>

                {b.promo && (
                  <p className="text-[11px] text-slate-400 line-clamp-2">
                    Promo: <span className="text-slate-300">{b.promo}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-500">
        "Depósitos que pagan" son los que ya te generan comisión (los cualificados).
        "Conversión" = de los que se registraron, cuántos han hecho un depósito que
        paga. El dinero de cada bot depende de que Celsius lo marque bien.
      </p>
    </main>
  );
}
