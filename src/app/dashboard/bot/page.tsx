"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { esGestorBot } from "@/lib/adminId";
import { RefreshCw, ChevronLeft } from "lucide-react";

type Jugador = {
  chat_id: number;
  first_name: string | null;
  username: string | null;
  last_msg_at: string | null;
  opted_out: boolean;
  silenced: boolean;
};

function iniciales(n?: string | null): string {
  const s = (n || "").trim();
  if (!s) return "?";
  const p = s.split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}
const AVATAR_COLORS = [
  "bg-emerald-500/25 text-emerald-200",
  "bg-sky-500/25 text-sky-200",
  "bg-fuchsia-500/25 text-fuchsia-200",
  "bg-amber-500/25 text-amber-200",
  "bg-rose-500/25 text-rose-200",
  "bg-indigo-500/25 text-indigo-200",
  "bg-teal-500/25 text-teal-200",
];
const colorAvatar = (id: number) => AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];

export default function BotLectorPage() {
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [dinero, setDinero] = useState<{ total: number; hoy: number; desde: string } | null>(null);
  const [jugadores, setJugadores] = useState<Jugador[] | null>(null);
  const [cargandoJug, setCargandoJug] = useState(false);
  const [chatAbierto, setChatAbierto] = useState<number | null>(null);
  const [chatMsgs, setChatMsgs] = useState<
    { role: string; content: string; created_at?: string; media_url?: string | null }[]
  >([]);
  const [cargandoChat, setCargandoChat] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const token = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return { t: session?.access_token ?? null, uid: session?.user?.id ?? null };
  }, []);

  const cargar = useCallback(async () => {
    const { t, uid } = await token();
    if (!t || !esGestorBot(uid)) {
      setAutorizado(false);
      return;
    }
    setAutorizado(true);
    setCargandoJug(true);
    try {
      const [rc, rm] = await Promise.all([
        fetch("/api/telegram/contacts", { headers: { Authorization: "Bearer " + t }, cache: "no-store" }),
        fetch("/api/telegram/bot-money", { headers: { Authorization: "Bearer " + t }, cache: "no-store" }),
      ]);
      const bc = await rc.json().catch(() => ({}));
      setJugadores(bc.jugadores ?? []);
      const bm = await rm.json().catch(() => ({}));
      if (typeof bm.total === "number") setDinero({ total: bm.total, hoy: bm.hoy, desde: bm.desde });
    } finally {
      setCargandoJug(false);
    }
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!cargandoChat && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMsgs, cargandoChat, chatAbierto]);

  async function verChat(chatId: number) {
    if (chatAbierto === chatId) {
      setChatAbierto(null);
      return;
    }
    setChatAbierto(chatId);
    setChatMsgs([]);
    setCargandoChat(true);
    try {
      const { t } = await token();
      if (!t) return;
      const r = await fetch("/api/telegram/chat?chat_id=" + chatId, {
        headers: { Authorization: "Bearer " + t },
      });
      const b = await r.json().catch(() => ({}));
      setChatMsgs(Array.isArray(b.history) ? b.history : []);
    } finally {
      setCargandoChat(false);
    }
  }

  if (autorizado === false) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center text-slate-300">
        No tienes acceso a esta sección.
      </div>
    );
  }

  const lista = (jugadores ?? []).filter((j) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (
      (j.first_name || "").toLowerCase().includes(q) ||
      (j.username || "").toLowerCase().includes(q) ||
      String(j.chat_id).includes(q)
    );
  });
  const chatSel = jugadores?.find((j) => j.chat_id === chatAbierto) ?? null;

  return (
    <main className="flex flex-col gap-5 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Conversaciones del bot</h1>
          <p className="text-sm text-slate-400 mt-1">
            Lee todas las charlas con los jugadores. Anota lo que veas para mejorarlo.
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={cargandoJug}
          className="shrink-0 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
        >
          <RefreshCw size={15} className={cargandoJug ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      {/* Dinero que ha generado el bot desde que empezó Yaiza. */}
      {dinero && (
        <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-5">
          <div className="text-sm text-emerald-200/80">
            💰 Dinero que ha generado el bot desde que estás
          </div>
          <div className="mt-1 text-4xl font-extrabold text-emerald-300">
            {Math.round(dinero.total).toLocaleString("es-ES")} €
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Desde el {new Date(dinero.desde + "T00:00:00").toLocaleDateString("es-ES")} · hoy:{" "}
            <b className="text-emerald-200">{Math.round(dinero.hoy).toLocaleString("es-ES")} €</b>
          </div>
        </div>
      )}

      {/* Lector de chats (solo lectura). */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
          <span className="text-sm font-semibold text-white shrink-0">
            💬 Chats{jugadores ? ` · ${jugadores.length}` : ""}
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="flex-1 min-w-0 rounded-lg bg-white/10 border border-white/20 text-white text-xs px-3 py-1.5 focus:outline-none focus:border-emerald-400/60"
          />
        </div>

        {!jugadores ? (
          <p className="text-sm text-slate-400 p-4">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-slate-400 p-4">Sin resultados.</p>
        ) : (
          <div className="flex h-[70vh] sm:h-[560px]">
            <div
              className={`${
                chatAbierto ? "hidden sm:flex" : "flex"
              } flex-col w-full sm:w-72 sm:border-r border-white/10 overflow-y-auto min-h-0 bg-black/20`}
            >
              {lista.map((j) => {
                const activo = chatAbierto === j.chat_id;
                return (
                  <button
                    key={j.chat_id}
                    onClick={() => verChat(j.chat_id)}
                    className={`flex items-center gap-3 text-left px-3 py-2.5 border-b border-white/5 transition ${
                      activo ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <div
                      className={`shrink-0 w-9 h-9 rounded-full grid place-items-center text-xs font-bold ${colorAvatar(
                        j.chat_id
                      )}`}
                    >
                      {iniciales(j.first_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-white truncate">{j.first_name || "Jugador"}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {j.last_msg_at
                            ? new Date(j.last_msg_at).toLocaleDateString("es-ES", {
                                day: "2-digit",
                                month: "2-digit",
                              })
                            : ""}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {j.silenced && <span className="text-amber-300">🔇 silenciado · </span>}
                        {j.opted_out && <span>baja · </span>}
                        {j.username ? `@${j.username}` : `#${j.chat_id}`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              className={`${
                chatAbierto ? "flex" : "hidden sm:flex"
              } flex-col flex-1 min-w-0 min-h-0 bg-[#0b141a]`}
            >
              {chatAbierto === null ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                  <span className="text-3xl">💬</span>
                  Elige un chat para leerlo
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/10 bg-black/40">
                    <button
                      onClick={() => setChatAbierto(null)}
                      className="sm:hidden text-slate-300 hover:text-white shrink-0"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold ${colorAvatar(
                        chatSel?.chat_id ?? 0
                      )}`}
                    >
                      {iniciales(chatSel?.first_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-white truncate leading-tight">
                        {chatSel?.first_name || "Jugador"}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate leading-tight">
                        {chatSel?.username ? `@${chatSel.username}` : `#${chatSel?.chat_id}`}
                      </div>
                    </div>
                  </div>
                  <div
                    ref={chatScrollRef}
                    className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-1.5"
                  >
                    {cargandoChat ? (
                      <p className="text-xs text-slate-400">Cargando…</p>
                    ) : chatMsgs.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin conversación guardada.</p>
                    ) : (
                      chatMsgs.map((m, i) => {
                        const bot = m.role === "assistant";
                        return (
                          <div key={i} className={`flex ${bot ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-xs leading-snug shadow-sm ${
                                bot
                                  ? "bg-emerald-700/90 text-white rounded-br-sm"
                                  : "bg-white/12 text-slate-100 rounded-bl-sm"
                              }`}
                            >
                              {m.media_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={m.media_url}
                                  alt="Imagen enviada"
                                  className="mb-1 max-w-[200px] rounded-lg"
                                  loading="lazy"
                                />
                              )}
                              {m.content}
                              {m.created_at && (
                                <div
                                  className={`text-[9px] mt-0.5 text-right ${
                                    bot ? "text-emerald-100/60" : "text-slate-400"
                                  }`}
                                >
                                  {new Date(m.created_at).toLocaleString("es-ES", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
