"use client";

import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { esGestorBot } from "@/lib/adminId";
import { reproducirSonido } from "@/lib/sonido";
import { RefreshCw, ChevronLeft, Bell, BellOff, VolumeX, Volume2 } from "lucide-react";

export type Jugador = {
  chat_id: number;
  first_name: string | null;
  username: string | null;
  last_msg_at: string | null;
  opted_out: boolean;
  silenced: boolean;
  origen: "as" | "jeffer" | "mariam";
  bot_nombre: string;
  ultimo: string | null; // texto del último mensaje (vista previa)
  ultimo_rol: string | null; // "user" (jugador) o "assistant" (bot)
};

export type DineroBot = {
  total: number;
  hoy: number;
  desde: string;
  veces: number;
  vecesHoy: number;
};

// Clave única de un chat: el mismo usuario podría hablar con dos bots, así que
// combinamos el bot (origen) con su chat_id.
const claveDe = (j: Jugador) => `${j.origen}:${j.chat_id}`;

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

// Color de la etiqueta de cada bot (Sandro / Jeffer / Livana).
const estiloEtiqueta = (origen: Jugador["origen"]) =>
  origen === "jeffer"
    ? "bg-fuchsia-500/25 text-fuchsia-200"
    : origen === "mariam"
      ? "bg-sky-500/25 text-sky-200"
      : "bg-emerald-500/25 text-emerald-200";

// Visor de chats de Telegram estilo WhatsApp (compartido entre el panel de Yaiza
// y el admin): lista con vista previa del último mensaje, etiqueta del bot
// (Sandro/Jeffer), no leídos (punto verde), buscador, sonido al llegar mensajes,
// contador en la pestaña y refresco automático. Junta los dos bots.
//  - onDinero: si se pasa, además pide el dinero del bot y lo reporta (para la
//    tarjeta del panel de Yaiza). El admin no lo usa.
//  - admin: muestra el botón de silenciar/reactivar dentro del chat abierto.
//  - contadorTitulo: pone el nº de no leídos en el título de la pestaña. SOLO en
//    el panel de Yaiza; en el admin NO, porque ahí la campana ya usa el título
//    (si no, se pelean y el contador de notificaciones parpadea).
export default function BotChatViewer({
  onDinero,
  admin = false,
  contadorTitulo = false,
}: {
  onDinero?: (d: DineroBot) => void;
  admin?: boolean;
  contadorTitulo?: boolean;
}) {
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [jugadores, setJugadores] = useState<Jugador[] | null>(null);
  const [cargandoJug, setCargandoJug] = useState(false);
  const [chatAbierto, setChatAbierto] = useState<string | null>(null);
  const [chatMsgs, setChatMsgs] = useState<
    { role: string; content: string; created_at?: string; media_url?: string | null }[]
  >([]);
  const [cargandoChat, setCargandoChat] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [leidos, setLeidos] = useState<Record<string, string>>({});
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // ¿Está el usuario pegado abajo del chat? Si subió a leer mensajes antiguos, NO
  // le mandamos al fondo cuando llega un mensaje o se refresca. Estilo WhatsApp.
  const pegadoAbajoRef = useRef(true);
  const alScrollChat = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    pegadoAbajoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const chatAbiertoRef = useRef<string | null>(null);
  useEffect(() => {
    chatAbiertoRef.current = chatAbierto;
  }, [chatAbierto]);
  const [sonidoOn, setSonidoOn] = useState(true);
  const sonidoOnRef = useRef(true);
  useEffect(() => {
    sonidoOnRef.current = sonidoOn;
  }, [sonidoOn]);
  const prevMsgRef = useRef<Record<string, string>>({});
  // El onDinero puede cambiar de identidad entre renders; lo guardamos en ref
  // para no recrear `cargar` (y su interval) por eso.
  const onDineroRef = useRef(onDinero);
  useEffect(() => {
    onDineroRef.current = onDinero;
  }, [onDinero]);

  // Preferencia de sonido guardada en este dispositivo.
  useEffect(() => {
    try {
      setSonidoOn(localStorage.getItem("bot_sonido") !== "off");
    } catch {
      /* ignora */
    }
  }, []);
  const toggleSonido = () => {
    setSonidoOn((v) => {
      const next = !v;
      try {
        localStorage.setItem("bot_sonido", next ? "on" : "off");
      } catch {
        /* ignora */
      }
      if (next) reproducirSonido("notif");
      return next;
    });
  };

  // Carga inicial de "leídos" guardados en este dispositivo.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bot_leidos");
      if (raw) setLeidos(JSON.parse(raw));
    } catch {
      /* ignora */
    }
  }, []);

  const marcarLeido = useCallback((clave: string, cuando?: string | null) => {
    if (!cuando) return;
    setLeidos((prev) => {
      if (prev[clave] === cuando) return prev;
      const next = { ...prev, [clave]: cuando };
      try {
        localStorage.setItem("bot_leidos", JSON.stringify(next));
      } catch {
        /* ignora */
      }
      return next;
    });
  }, []);

  const token = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return { t: session?.access_token ?? null, uid: session?.user?.id ?? null };
  }, []);

  const cargarChat = useCallback(
    async (j: Jugador) => {
      const { t } = await token();
      if (!t) return;
      const r = await fetch(
        `/api/telegram/chat?chat_id=${j.chat_id}&origen=${j.origen}`,
        { headers: { Authorization: "Bearer " + t } }
      );
      const b = await r.json().catch(() => ({}));
      setChatMsgs(Array.isArray(b.history) ? b.history : []);
    },
    [token]
  );

  const cargar = useCallback(
    async (silent = false) => {
      const { t, uid } = await token();
      if (!t || !esGestorBot(uid)) {
        setAutorizado(false);
        return;
      }
      setAutorizado(true);
      if (!silent) setCargandoJug(true);
      try {
        const pideDinero = !!onDineroRef.current;
        const peticiones = [
          fetch("/api/telegram/contacts", { headers: { Authorization: "Bearer " + t }, cache: "no-store" }),
        ];
        if (pideDinero)
          peticiones.push(
            fetch("/api/telegram/bot-money", { headers: { Authorization: "Bearer " + t }, cache: "no-store" })
          );
        const [rc, rm] = await Promise.all(peticiones);
        const bc = await rc.json().catch(() => ({}));
        const nuevos: Jugador[] = bc.jugadores ?? [];
        setJugadores(nuevos);
        // ¿Mensaje nuevo desde el último refresco? (un chat con last_msg_at más
        // nuevo, que no sea el abierto). Si sí y el sonido está activo, suena.
        {
          const prev = prevMsgRef.current;
          const primeraVez = Object.keys(prev).length === 0;
          let hayNuevo = false;
          const actual: Record<string, string> = {};
          for (const j of nuevos) {
            if (!j.last_msg_at) continue;
            const k = claveDe(j);
            actual[k] = j.last_msg_at;
            if (k !== chatAbiertoRef.current && (!prev[k] || j.last_msg_at > prev[k]))
              hayNuevo = true;
          }
          prevMsgRef.current = actual;
          if (hayNuevo && !primeraVez && sonidoOnRef.current) reproducirSonido("notif");
        }
        // La PRIMERA vez marcamos todo como visto (si no, saldría todo en verde).
        try {
          if (localStorage.getItem("bot_leidos") === null) {
            const seed: Record<string, string> = {};
            for (const j of nuevos) if (j.last_msg_at) seed[claveDe(j)] = j.last_msg_at;
            localStorage.setItem("bot_leidos", JSON.stringify(seed));
            setLeidos(seed);
          }
        } catch {
          /* ignora */
        }
        const abierto = chatAbiertoRef.current;
        if (abierto != null) {
          const jj = nuevos.find((j) => claveDe(j) === abierto);
          if (jj?.last_msg_at) marcarLeido(abierto, jj.last_msg_at);
          if (silent && jj) cargarChat(jj);
        }
        if (pideDinero && rm) {
          const bm = await rm.json().catch(() => ({}));
          if (typeof bm.total === "number")
            onDineroRef.current?.({
              total: bm.total,
              hoy: bm.hoy,
              desde: bm.desde,
              veces: bm.qftdTotal ?? 0,
              vecesHoy: bm.qftdHoy ?? 0,
            });
        }
      } finally {
        if (!silent) setCargandoJug(false);
      }
    },
    [token, marcarLeido, cargarChat]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const id = setInterval(() => cargar(true), 20_000);
    return () => clearInterval(id);
  }, [cargar]);

  useEffect(() => {
    // Baja al fondo SOLO si el usuario ya estaba abajo (o acaba de abrir el chat).
    // Si subió a leer mensajes antiguos, lo dejamos donde está.
    if (!cargandoChat && chatScrollRef.current && pegadoAbajoRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMsgs, cargandoChat, chatAbierto]);

  // Contador en el título de la pestaña (estilo WhatsApp Web). SOLO si nadie más
  // usa el título en esta página (en el admin lo lleva la campana, así que ahí
  // NO lo tocamos para que no se peleen y parpadee).
  useEffect(() => {
    if (!contadorTitulo) return;
    const previo = document.title;
    const sinLeer = (jugadores ?? []).filter((j) => {
      const k = claveDe(j);
      return (
        !!j.last_msg_at && k !== chatAbierto && (!leidos[k] || j.last_msg_at > leidos[k])
      );
    }).length;
    document.title = sinLeer > 0 ? `(${sinLeer}) Chats del bot` : "Chats del bot";
    return () => {
      document.title = previo;
    };
  }, [contadorTitulo, jugadores, leidos, chatAbierto]);

  async function verChat(j: Jugador) {
    const clave = claveDe(j);
    if (chatAbierto === clave) {
      setChatAbierto(null);
      return;
    }
    marcarLeido(clave, j.last_msg_at);
    pegadoAbajoRef.current = true; // al abrir un chat, empieza abajo (lo más nuevo)
    setChatAbierto(clave);
    setChatMsgs([]);
    setCargandoChat(true);
    try {
      await cargarChat(j);
    } finally {
      setCargandoChat(false);
    }
  }

  async function toggleSilencio(j: Jugador) {
    const { t } = await token();
    if (!t) return;
    const nuevo = !j.silenced;
    setJugadores((js) =>
      (js ?? []).map((x) => (claveDe(x) === claveDe(j) ? { ...x, silenced: nuevo } : x))
    );
    await fetch("/api/telegram/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ chat_id: j.chat_id, origen: j.origen, silenced: nuevo }),
    }).catch(() => {});
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
  const chatSel = jugadores?.find((j) => claveDe(j) === chatAbierto) ?? null;
  const noLeido = (j: Jugador) => {
    const k = claveDe(j);
    return !!j.last_msg_at && k !== chatAbierto && (!leidos[k] || j.last_msg_at > leidos[k]);
  };
  const nSinLeer = (jugadores ?? []).filter(noLeido).length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-white shrink-0 flex items-center gap-2">
          💬 Chats{jugadores ? ` · ${jugadores.length}` : ""}
          {nSinLeer > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-black text-[11px] font-bold">
              {nSinLeer}
            </span>
          )}
        </span>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre…"
          className="flex-1 min-w-[120px] rounded-lg bg-white/10 border border-white/20 text-white text-xs px-3 py-1.5 focus:outline-none focus:border-emerald-400/60"
        />
        <button
          onClick={toggleSonido}
          title={sonidoOn ? "Sonido activado (toca para silenciar)" : "Sonido silenciado (toca para activar)"}
          className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition ${
            sonidoOn
              ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
              : "bg-white/10 text-slate-400 hover:bg-white/20"
          }`}
        >
          {sonidoOn ? <Bell size={14} /> : <BellOff size={14} />}
          {sonidoOn ? "Sonido" : "Silencio"}
        </button>
        <button
          onClick={() => cargar()}
          disabled={cargandoJug}
          className="shrink-0 inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition"
        >
          <RefreshCw size={14} className={cargandoJug ? "animate-spin" : ""} />
          Actualizar
        </button>
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
              const clave = claveDe(j);
              const activo = chatAbierto === clave;
              const sinLeer = noLeido(j);
              return (
                <button
                  key={clave}
                  onClick={() => verChat(j)}
                  className={`flex items-center gap-3 text-left px-3 py-2.5 border-b border-white/5 transition ${
                    activo ? "bg-white/10" : sinLeer ? "bg-emerald-500/10 hover:bg-emerald-500/15" : "hover:bg-white/5"
                  }`}
                >
                  <div
                    className={`relative shrink-0 w-9 h-9 rounded-full grid place-items-center text-xs font-bold ${colorAvatar(
                      j.chat_id
                    )}`}
                  >
                    {iniciales(j.first_name)}
                    {sinLeer && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-black" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm truncate flex items-center gap-1.5 ${
                          sinLeer ? "text-white font-bold" : "text-white"
                        }`}
                      >
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${estiloEtiqueta(
                            j.origen
                          )}`}
                        >
                          {j.bot_nombre}
                        </span>
                        <span className="truncate">{j.first_name || "Jugador"}</span>
                      </span>
                      <span className="text-[10px] text-slate-500 shrink-0 text-right leading-tight">
                        {j.last_msg_at ? (
                          <>
                            {new Date(j.last_msg_at).toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                            <br />
                            {new Date(j.last_msg_at).toLocaleTimeString("es-ES", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </>
                        ) : (
                          ""
                        )}
                      </span>
                    </div>
                    <div className={`text-[11px] truncate ${sinLeer ? "text-slate-200" : "text-slate-500"}`}>
                      {j.silenced && <span className="text-amber-300">🔇 </span>}
                      {j.ultimo ? (
                        <>
                          {j.ultimo_rol === "assistant" && <span className="text-slate-500">Bot: </span>}
                          {j.ultimo}
                        </>
                      ) : (
                        <span className="text-slate-500">
                          {j.username ? `@${j.username}` : `#${j.chat_id}`}
                        </span>
                      )}
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
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white truncate leading-tight flex items-center gap-1.5">
                      {chatSel && (
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${estiloEtiqueta(
                            chatSel.origen
                          )}`}
                        >
                          {chatSel.bot_nombre}
                        </span>
                      )}
                      <span className="truncate">{chatSel?.first_name || "Jugador"}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate leading-tight">
                      {chatSel?.username ? `@${chatSel.username}` : `#${chatSel?.chat_id}`}
                    </div>
                  </div>
                  {admin && chatSel && (
                    <button
                      onClick={() => toggleSilencio(chatSel)}
                      title={chatSel.silenced ? "Reactivar (el bot le vuelve a responder)" : "Silenciar (el bot deja de responderle)"}
                      className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition ${
                        chatSel.silenced
                          ? "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                          : "bg-white/10 text-slate-300 hover:bg-white/20"
                      }`}
                    >
                      {chatSel.silenced ? <Volume2 size={14} /> : <VolumeX size={14} />}
                      {chatSel.silenced ? "Reactivar" : "Silenciar"}
                    </button>
                  )}
                </div>
                <div
                  ref={chatScrollRef}
                  onScroll={alScrollChat}
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
  );
}
