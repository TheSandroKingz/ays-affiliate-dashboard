"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { RefreshCw, ChevronLeft } from "lucide-react";
import BotChatViewer from "@/components/BotChatViewer";
import InformeAnalisis from "@/components/InformeAnalisis";

export default function TelegramPage() {
  const router = useRouter();
  const [configurado, setConfigurado] = useState(true);
  const [stats, setStats] = useState<{
    activos: number;
    total: number;
    bajas: number;
    silenciados: number;
    nuevos24h: number;
    escribieron24h: number;
    iaHoy: number;
    bot: { depTot: number; eurTot: number; dep: number; eur: number };
    recargas?: { nTot: number; eurTot: number; n: number; eur: number };
    recargasLista?: { importe: number; fecha: string; player: string | null }[];
    etiqueta?: string;
  } | null>(null);
  // Período del "dinero generado": "total" | "hoy" | "ayer" | "YYYY-MM".
  const [periodo, setPeriodo] = useState<string>("total");
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || session.user.id !== ADMIN_USER_ID) {
      router.replace("/dashboard");
      return;
    }
    const fMadrid = (off: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(
        new Date(Date.now() + off * 864e5)
      );
    const qp =
      periodo === "total"
        ? ""
        : periodo === "hoy"
        ? `?dia=${fMadrid(0)}`
        : periodo === "ayer"
        ? `?dia=${fMadrid(-1)}`
        : `?mes=${periodo}`;
    const res = await fetch("/api/telegram/broadcast" + qp, {
      headers: { Authorization: "Bearer " + session.access_token },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (res) {
      setConfigurado(res.configurado !== false);
      setStats(res.stats ?? null);
    }
  }, [router, periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <main className="flex flex-col gap-5">
      <button
        onClick={() => router.back()}
        className="self-start inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition"
      >
        <ChevronLeft size={16} /> Volver
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Telegram</h1>
          <p className="text-sm text-slate-400 mt-1">
            El dinero que trae el bot, sus respuestas y los chats con los jugadores.
          </p>
        </div>
        <button
          onClick={async () => {
            setRefrescando(true);
            await cargar();
            setRefrescando(false);
          }}
          disabled={refrescando}
          className="shrink-0 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
        >
          <RefreshCw size={15} className={refrescando ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      {!configurado && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
          El bot aún no está configurado en el servidor (falta{" "}
          <span className="font-mono">TELEGRAM_BOT_TOKEN</span> en Vercel).
        </div>
      )}

      {stats && (
        <div className="flex flex-col gap-3">
          {/* Dinero que me ha generado el bot, por período (Hoy/Ayer/mes/Total). */}
          <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm text-emerald-200/80">
                💰 Dinero que me ha generado el bot
              </div>
              <div className="flex items-center gap-1 text-xs">
                {([["hoy", "Hoy"], ["ayer", "Ayer"], ["total", "Total"]] as [string, string][]).map(
                  ([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setPeriodo(v)}
                      className={`px-2.5 py-1 rounded-lg border transition ${
                        periodo === v
                          ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                          : "border-white/15 text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      {l}
                    </button>
                  )
                )}
                <select
                  value={/^\d{4}-\d{2}$/.test(periodo) ? periodo : ""}
                  onChange={(e) => e.target.value && setPeriodo(e.target.value)}
                  className={`px-2 py-1 rounded-lg border bg-transparent ${
                    /^\d{4}-\d{2}$/.test(periodo)
                      ? "border-emerald-400/60 text-emerald-200"
                      : "border-white/15 text-slate-300"
                  }`}
                >
                  <option value="">Mes…</option>
                  {Array.from({ length: 6 }, (_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  }).map((m) => (
                    <option key={m} value={m} className="text-black">
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-1 text-5xl font-extrabold text-emerald-300">
              {Math.round(periodo === "total" ? stats.bot.eurTot : stats.bot.eur).toLocaleString(
                "es-ES"
              )}{" "}
              €
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {periodo === "total"
                ? "Total desde el primer día · nunca se reinicia"
                : `Generado · ${stats.etiqueta ?? periodo}`}
            </div>
          </div>

          {/* Más específico: en listas (etiqueta → valor). */}
          <div>
            <div className="text-sm text-slate-300 font-medium mb-2">Más específico</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                {
                  t: "💵 Depósitos del bot",
                  rows: [
                    ["Primeros depósitos (FTD)", periodo === "total" ? stats.bot.depTot : stats.bot.dep],
                    ["Dinero que metieron", `${Math.round(periodo === "total" ? (stats.recargas?.eurTot ?? 0) : (stats.recargas?.eur ?? 0)).toLocaleString("es-ES")} €`],
                    ["Recargas", periodo === "total" ? (stats.recargas?.nTot ?? 0) : (stats.recargas?.n ?? 0)],
                  ] as [string, string | number][],
                },
                {
                  t: "👥 Comunidad",
                  rows: [
                    ["Total", stats.total],
                    ["Activos", stats.activos],
                    ["Silenciados", stats.silenciados],
                    ["Bajas", stats.bajas],
                  ] as [string, string | number][],
                },
                {
                  t: "⚡ Actividad (24h)",
                  rows: [
                    ["Escribieron", stats.escribieron24h],
                    ["Nuevos", stats.nuevos24h],
                    ["Respuestas IA hoy", stats.iaHoy],
                  ] as [string, string | number][],
                },
              ].map((card) => (
                <div key={card.t} className="rounded-2xl border border-white/15 bg-white/5 p-4">
                  <div className="text-xs text-slate-400 mb-3">{card.t}</div>
                  <div className="flex flex-col gap-2">
                    {card.rows.map(([l, v]) => (
                      <div
                        key={l}
                        className="flex items-center justify-between text-sm border-b border-white/5 pb-1.5 last:border-0 last:pb-0"
                      >
                        <span className="text-slate-400">{l}</span>
                        <span className="text-white font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Últimas recargas: plegable y colapsado por defecto. */}
          {stats.recargasLista && stats.recargasLista.length > 0 && (
            <details className="group rounded-2xl border border-white/10 bg-black/40">
              <summary className="flex items-center justify-between cursor-pointer select-none list-none px-4 py-2.5 text-sm text-slate-300 font-medium">
                <span>Últimas recargas ({stats.recargasLista.length})</span>
                <span className="text-slate-500 text-xs transition-transform group-open:rotate-180">
                  ▼
                </span>
              </summary>
              <div className="flex flex-col gap-1 px-4 pb-4 max-h-56 overflow-y-auto">
                {stats.recargasLista.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs border-b border-white/5 pb-1.5 last:border-0 last:pb-0"
                  >
                    <span className="text-slate-400">
                      {new Date(r.fecha).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {r.player ? ` · #${r.player}` : ""}
                    </span>
                    <span className="font-semibold text-teal-200">
                      {r.importe > 0
                        ? `${Math.round(r.importe).toLocaleString("es-ES")} €`
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Informe de análisis supervisado (Fase 1b). Admin puede generarlo a mano. */}
      <InformeAnalisis isAdmin />

      {/* Chats con los jugadores (Sandro + Jeffer), estilo WhatsApp. */}
      <BotChatViewer admin />

      <p className="text-xs text-slate-500">
        Puedes silenciar a un pesado desde su chat. Cada jugador puede darse de
        baja con /stop. Los chats de Jeffer salen con su etiqueta.
      </p>
    </main>
  );
}
