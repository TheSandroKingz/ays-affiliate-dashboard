"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";
import { ChevronLeft } from "lucide-react";

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

type Jugador = {
  chat_id: number;
  first_name: string | null;
  username: string | null;
  last_msg_at: string | null;
  opted_out: boolean;
};

type Msg = {
  role: string;
  content: string;
  created_at: string;
  media_type: string | null;
  media_url: string | null;
};

export default function MiBotTelegramPage() {
  const [data, setData] = useState<MiBot | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  const [jugadores, setJugadores] = useState<Jugador[] | null>(null);
  const [cargandoJug, setCargandoJug] = useState(false);
  const [chatAbierto, setChatAbierto] = useState<number | null>(null);
  const [chatMsgs, setChatMsgs] = useState<Msg[]>([]);
  const [cargandoChat, setCargandoChat] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatPedidoRef = useRef<number | null>(null);

  async function token() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  // Carga los depósitos + la lista de chats al entrar.
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError(false);
      try {
        const t = await token();
        if (!t) {
          setError(true);
          return;
        }
        const auth = { Authorization: "Bearer " + t };
        const [rDep, rChats] = await Promise.all([
          fetch("/api/telegram/mi-bot", { headers: auth }),
          fetch("/api/telegram/mi-bot/chats", { headers: auth }),
        ]);
        if (!rDep.ok) {
          setError(true);
          return;
        }
        const dep = await rDep.json();
        const chats = rChats.ok ? await rChats.json() : { jugadores: [] };
        if (vivo) {
          setData(dep);
          setJugadores(chats.jugadores ?? []);
        }
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

  // Al abrir un chat, baja hasta el último mensaje.
  useEffect(() => {
    if (!cargandoChat && chatMsgs.length && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMsgs, cargandoChat]);

  async function recargarChats() {
    setCargandoJug(true);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/telegram/mi-bot/chats", {
        headers: { Authorization: "Bearer " + t },
      });
      if (r.ok) {
        const b = await r.json();
        setJugadores(b.jugadores ?? []);
      }
    } finally {
      setCargandoJug(false);
    }
  }

  async function verChat(chatId: number) {
    chatPedidoRef.current = chatId;
    setChatAbierto(chatId);
    setCargandoChat(true);
    setChatMsgs([]);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/telegram/mi-bot/chat?chat_id=" + chatId, {
        headers: { Authorization: "Bearer " + t },
      });
      if (r.ok) {
        const b = await r.json();
        // Si mientras cargaba se abrió OTRO chat, no pintamos este (evita mezclar).
        if (chatPedidoRef.current === chatId) setChatMsgs(b.history ?? []);
      }
    } finally {
      if (chatPedidoRef.current === chatId) setCargandoChat(false);
    }
  }

  const chatSel = jugadores?.find((j) => j.chat_id === chatAbierto) ?? null;

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
        <p className="text-sm text-slate-400">
          Aún no tienes un bot asignado.
        </p>
      ) : (
        <>
          {/* Depósitos */}
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

          {/* Conversaciones */}
          <div className="bg-white/5 border border-white/15 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-200">
                💬 Conversaciones {jugadores ? `(${jugadores.length})` : ""}
              </span>
              <button
                onClick={recargarChats}
                disabled={cargandoJug}
                className="shrink-0 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
              >
                {cargandoJug ? "Cargando…" : "Actualizar"}
              </button>
            </div>

            {jugadores && jugadores.length === 0 && (
              <p className="text-sm text-slate-400">Aún no hay conversaciones.</p>
            )}

            {jugadores && jugadores.length > 0 && (
              <div className="flex rounded-xl overflow-hidden border border-white/10 h-[70vh] sm:h-[520px]">
                {/* Lista (izquierda) */}
                <div
                  className={`${
                    chatAbierto ? "hidden sm:flex" : "flex"
                  } flex-col w-full sm:w-60 sm:border-r border-white/10 overflow-y-auto min-h-0 bg-black/20`}
                >
                  {jugadores.map((j) => (
                    <button
                      key={j.chat_id}
                      onClick={() => verChat(j.chat_id)}
                      className={`text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition ${
                        chatAbierto === j.chat_id ? "bg-white/10" : ""
                      }`}
                    >
                      <div className="text-sm text-white truncate">
                        {j.first_name || "Jugador"}{" "}
                        {j.username ? `(@${j.username})` : ""}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {j.opted_out && <span>baja · </span>}
                        {j.last_msg_at
                          ? new Date(j.last_msg_at).toLocaleString("es-ES", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "sin actividad"}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Conversación (derecha) */}
                <div
                  className={`${
                    chatAbierto ? "flex" : "hidden sm:flex"
                  } flex-col flex-1 min-w-0 min-h-0 bg-black/30`}
                >
                  {chatAbierto === null ? (
                    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                      Elige un chat de la lista 👈
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/40">
                        <button
                          onClick={() => setChatAbierto(null)}
                          aria-label="Volver a la lista"
                          className="sm:hidden text-slate-300 hover:text-white shrink-0"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <span className="text-sm text-white truncate">
                          {chatSel?.first_name || "Jugador"}{" "}
                          {chatSel?.username ? `(@${chatSel.username})` : ""}
                        </span>
                      </div>
                      <div
                        ref={chatScrollRef}
                        className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2"
                      >
                        {cargandoChat ? (
                          <p className="text-xs text-slate-400">Cargando…</p>
                        ) : chatMsgs.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            Sin conversación guardada.
                          </p>
                        ) : (
                          chatMsgs.map((m, i) => {
                            const bot = m.role === "assistant";
                            return (
                              <div
                                key={i}
                                className={`flex ${
                                  bot ? "justify-end" : "justify-start"
                                }`}
                              >
                                <div
                                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs leading-snug ${
                                    bot
                                      ? "bg-emerald-600 text-white rounded-br-sm"
                                      : "bg-white/15 text-slate-100 rounded-bl-sm"
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
                                      className={`text-[9px] mt-0.5 ${
                                        bot
                                          ? "text-emerald-100/70"
                                          : "text-slate-400"
                                      }`}
                                    >
                                      {new Date(m.created_at).toLocaleString(
                                        "es-ES",
                                        {
                                          day: "2-digit",
                                          month: "2-digit",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        }
                                      )}
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
        </>
      )}
    </div>
  );
}
