"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { Send, RefreshCw, ChevronLeft } from "lucide-react";

type Jugador = {
  chat_id: number;
  first_name: string | null;
  username: string | null;
  last_msg_at: string | null;
  opted_out: boolean;
  silenced: boolean;
};

export default function TelegramPage() {
  const router = useRouter();
  const [contactos, setContactos] = useState<number | null>(null);
  const [configurado, setConfigurado] = useState(true);
  const [diario, setDiario] = useState<{ activo: boolean; tipo: string | null } | null>(null);
  const [stats, setStats] = useState<{
    activos: number;
    total: number;
    bajas: number;
    silenciados: number;
    nuevos24h: number;
    escribieron24h: number;
    iaHoy: number;
    bot: {
      depTot: number; depHoy: number; dep7: number; dep30: number;
      eurTot: number; eurHoy: number; eur7: number; eur30: number;
    };
  } | null>(null);
  const [texto, setTexto] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);
  const [promo, setPromo] = useState("");
  const [promoGuardada, setPromoGuardada] = useState(true);
  const [guardandoPromo, setGuardandoPromo] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const [diag, setDiag] = useState<string | null>(null);
  const [reconectando, setReconectando] = useState(false);
  const [recon, setRecon] = useState<string | null>(null);
  const [probandoDiario, setProbandoDiario] = useState(false);
  const [testDiario, setTestDiario] = useState<string | null>(null);
  const [enviandoAhora, setEnviandoAhora] = useState(false);
  const [resAhora, setResAhora] = useState<string | null>(null);

  async function enviarDiarioAhora() {
    if (!confirm("¿Enviar el mensaje diario AHORA a todos los jugadores?")) return;
    setEnviandoAhora(true);
    setResAhora(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/cron/telegram-daily?force=1", {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const b = await r.json().catch(() => ({}));
      if (b.enviado) {
        setResAhora(`✅ Enviado a ${b.enviados} de ${b.total}.`);
      } else {
        setResAhora("⚠️ " + (b.motivo || b.error || "No se envió."));
      }
    } catch {
      setResAhora("⚠️ No se pudo (mira tu conexión).");
    } finally {
      setEnviandoAhora(false);
    }
  }
  const [reiniciando, setReiniciando] = useState(false);
  const [reinicio, setReinicio] = useState<string | null>(null);
  const [jugadores, setJugadores] = useState<Jugador[] | null>(null);
  const [cargandoJug, setCargandoJug] = useState(false);
  const [chatAbierto, setChatAbierto] = useState<number | null>(null);
  const [chatMsgs, setChatMsgs] = useState<
    { role: string; content: string; created_at?: string }[]
  >([]);
  const [cargandoChat, setCargandoChat] = useState(false);

  async function verChat(chatId: number) {
    if (chatAbierto === chatId) {
      setChatAbierto(null);
      return;
    }
    setChatAbierto(chatId);
    setChatMsgs([]);
    setCargandoChat(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/telegram/chat?chat_id=" + chatId, {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const b = await r.json().catch(() => ({}));
      setChatMsgs(Array.isArray(b.history) ? b.history : []);
    } finally {
      setCargandoChat(false);
    }
  }

  async function cargarJugadores() {
    setCargandoJug(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/telegram/contacts", {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const b = await r.json().catch(() => ({}));
      setJugadores(b.jugadores ?? []);
    } finally {
      setCargandoJug(false);
    }
  }

  async function toggleSilencio(chatId: number, silenced: boolean) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    await fetch("/api/telegram/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ chat_id: chatId, silenced }),
    });
    setJugadores((js) =>
      (js ?? []).map((j) => (j.chat_id === chatId ? { ...j, silenced } : j))
    );
  }

  async function reiniciarMemoria() {
    if (!confirm("¿Borrar la memoria de todas las conversaciones? (no borra contactos)")) return;
    setReiniciando(true);
    setReinicio(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/telegram/reset-memory", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const b = await r.json().catch(() => ({}));
      setReinicio(b.ok ? "✅ Memoria borrada. El bot empieza de cero." : "⚠️ " + (b.error || "No se pudo."));
    } catch {
      setReinicio("⚠️ No se pudo (mira tu conexión).");
    } finally {
      setReiniciando(false);
    }
  }

  async function probarDiario() {
    setProbandoDiario(true);
    setTestDiario(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/telegram/test-daily", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const b = await r.json().catch(() => ({}));
      if (b.ok) {
        setTestDiario(
          "✅ Te lo he enviado por Telegram (solo a ti)" +
            (b.con_video ? " con el vídeo" : " (sin vídeo)") +
            ". Míralo en tu chat con el bot."
        );
      } else {
        setTestDiario("⚠️ " + (b.error || "No se pudo enviar."));
      }
    } catch {
      setTestDiario("⚠️ No se pudo probar (mira tu conexión).");
    } finally {
      setProbandoDiario(false);
    }
  }

  async function reconectar() {
    setReconectando(true);
    setRecon(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/telegram/setup", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const b = await r.json().catch(() => ({}));
      if (b.ok) {
        setRecon("✅ Bot reconectado a esta web. Prueba a escribirle otra vez.");
      } else {
        setRecon("⚠️ No se pudo reconectar: " + (b.error || "error desconocido"));
      }
    } catch {
      setRecon("⚠️ No se pudo reconectar (mira tu conexión).");
    } finally {
      setReconectando(false);
    }
  }

  async function probarBot() {
    setProbando(true);
    setDiag(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/telegram/diag", {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const b = await r.json().catch(() => ({}));
      if (b.ok) {
        setDiag("✅ El bot con IA funciona. Respuesta de prueba: “" + (b.respuesta_prueba || "") + "”");
      } else if (!b.clave_presente) {
        setDiag("❌ Falta la clave de Claude (ANTHROPIC_API_KEY) en Vercel, o no se hizo Redeploy.");
      } else {
        setDiag(
          "❌ La clave está (" +
            (b.clave_empieza_por || "") +
            ") pero Claude da error" +
            (b.status ? " " + b.status : "") +
            ": " +
            (b.mensaje_error || "desconocido")
        );
      }
    } catch {
      setDiag("⚠️ No se pudo comprobar (mira tu conexión).");
    } finally {
      setProbando(false);
    }
  }

  const cargar = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || session.user.id !== ADMIN_USER_ID) {
      router.replace("/dashboard");
      return;
    }
    const res = await fetch("/api/telegram/broadcast", {
      headers: { Authorization: "Bearer " + session.access_token },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (res) {
      setContactos(Number(res.contactos ?? 0));
      setConfigurado(res.configurado !== false);
      setDiario(res.diario ?? null);
      setStats(res.stats ?? null);
      setPromo(res.promo ?? "");
      setPromoGuardada(true);
    }
  }, [router]);

  useEffect(() => {
    cargar();
    cargarJugadores(); // carga la lista de chats al entrar
  }, [cargar]);

  async function guardarPromo() {
    setGuardandoPromo(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch("/api/telegram/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({ promo }),
      });
      if (r.ok) setPromoGuardada(true);
    } finally {
      setGuardandoPromo(false);
    }
  }

  async function enviar() {
    if (!texto.trim()) return;
    if (
      !confirm(
        soloActivos
          ? "¿Enviar este mensaje SOLO a los jugadores activos (7 días)?"
          : `¿Enviar este mensaje a ${contactos ?? 0} contacto(s) de Telegram?`
      )
    )
      return;
    setEnviando(true);
    setResultado(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/telegram/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({
          texto,
          soloActivos,
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResultado("⚠️ " + (b.error || "No se pudo enviar."));
      } else {
        setResultado(
          `✅ Enviado a ${b.enviados} de ${b.total}${
            b.fallos ? ` (${b.fallos} fallaron)` : ""
          }.`
        );
        setTexto("");
        cargar();
      }
    } finally {
      setEnviando(false);
    }
  }

  const chatSel = jugadores?.find((j) => j.chat_id === chatAbierto) ?? null;

  return (
    <main className="flex flex-col gap-5 max-w-3xl">
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
            Manda un mensaje a todos los jugadores que se han unido al bot.
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
          {/* Tarjeta principal: € generado por el bot */}
          <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-4">
            <div className="text-xs text-emerald-200/80">
              💰 Generado por el bot
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-emerald-300">
                {Math.round(stats.bot.eurTot)} €
              </span>
              <span className="text-sm text-slate-400">
                · {stats.bot.depTot} depósitos
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { l: "Hoy", e: stats.bot.eurHoy, d: stats.bot.depHoy },
                { l: "7 días", e: stats.bot.eur7, d: stats.bot.dep7 },
                { l: "30 días", e: stats.bot.eur30, d: stats.bot.dep30 },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-xl bg-black/20 px-2 py-2 text-center"
                >
                  <div className="text-base font-semibold text-emerald-200">
                    {Math.round(s.e)} €
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {s.d} dep · {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Comunidad + actividad: dos tarjetas limpias (etiqueta → valor) */}
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                t: "👥 Comunidad",
                rows: [
                  ["Total", stats.total],
                  ["Activos", stats.activos],
                  ["Silenciados", stats.silenciados],
                  ["Bajas", stats.bajas],
                ] as [string, number][],
              },
              {
                t: "⚡ Actividad (24h)",
                rows: [
                  ["Escribieron", stats.escribieron24h],
                  ["Nuevos", stats.nuevos24h],
                  ["Respuestas IA hoy", stats.iaHoy],
                ] as [string, number][],
              },
            ].map((card) => (
              <div
                key={card.t}
                className="rounded-2xl border border-white/15 bg-white/5 p-4"
              >
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
      )}

      {/* Promo activa que el bot menciona */}
      <div className="bg-white/5 border border-white/15 rounded-xl p-4 flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-200">
          🎁 Promo activa (el bot la menciona)
        </label>
        <textarea
          value={promo}
          onChange={(e) => {
            setPromo(e.target.value);
            setPromoGuardada(false);
          }}
          rows={2}
          placeholder="Ej: Hoy recarga del 50% metiendo 20€ o más 🔥 (déjalo vacío si no hay promo)"
          className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-400/60"
        />
        <button
          onClick={guardarPromo}
          disabled={guardandoPromo || promoGuardada}
          className="self-start bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
        >
          {guardandoPromo ? "Guardando…" : promoGuardada ? "Guardada" : "Guardar promo"}
        </button>
      </div>

      <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-300">
            🤖 Respuestas automáticas con IA
          </span>
          <button
            onClick={probarBot}
            disabled={probando}
            className="shrink-0 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
          >
            {probando ? "Probando…" : "Probar bot"}
          </button>
        </div>
        {diag && <p className="text-sm text-slate-200">{diag}</p>}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2 mt-1">
          <span className="text-sm text-slate-300">
            🧠 Memoria del bot (si sigue con el tono viejo)
          </span>
          <button
            onClick={reiniciarMemoria}
            disabled={reiniciando}
            className="shrink-0 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
          >
            {reiniciando ? "Borrando…" : "Reiniciar memoria"}
          </button>
        </div>
        {reinicio && <p className="text-sm text-slate-200">{reinicio}</p>}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2 mt-1">
          <span className="text-sm text-slate-300">
            🔌 Conexión del bot (webhook)
          </span>
          <button
            onClick={reconectar}
            disabled={reconectando}
            className="shrink-0 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
          >
            {reconectando ? "Reconectando…" : "Reconectar bot"}
          </button>
        </div>
        {recon && <p className="text-sm text-slate-200">{recon}</p>}
        <div className="border-t border-white/10 pt-2 mt-1 text-sm text-slate-300">
          📅 Mensaje diario automático:{" "}
          {diario === null ? (
            <span className="text-slate-400">sin configurar</span>
          ) : diario.activo ? (
            <span className="text-emerald-300">✅ activo ({diario.tipo})</span>
          ) : (
            <span className="text-amber-300">⏸️ pausado</span>
          )}
          <p className="text-[11px] text-slate-500 mt-1">
            Sale a las <b>20:00</b> (hora española). La IA escribe
            un texto distinto cada día. Para poner/cambiar el vídeo: mándale al
            bot <b>/diario</b> con el vídeo (escribe <b>/diario</b> en el pie).
            Pausar el vídeo: <b>/diario off</b>.
          </p>
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm text-slate-300">🧪 Ver un ejemplo</span>
            <button
              onClick={probarDiario}
              disabled={probandoDiario}
              className="shrink-0 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
            >
              {probandoDiario ? "Enviando…" : "Probar envío diario"}
            </button>
          </div>
          {testDiario && <p className="text-sm text-slate-200">{testDiario}</p>}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm text-slate-300">📤 Enviar ahora a todos</span>
            <button
              onClick={enviarDiarioAhora}
              disabled={enviandoAhora}
              className="shrink-0 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
            >
              {enviandoAhora ? "Enviando…" : "Enviar diario ahora"}
            </button>
          </div>
          {resAhora && <p className="text-sm text-slate-200">{resAhora}</p>}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-5 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1">
            Mensaje
          </label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            placeholder="Escribe el mensaje… (puedes usar &lt;b&gt;negrita&lt;/b&gt; y emojis)"
            className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-400/60"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            {texto.length}/4000 · admite HTML básico (&lt;b&gt;, &lt;i&gt;, &lt;a
            href&gt;)
          </p>
        </div>
        <p className="text-[11px] text-slate-500">
          ¿Mandar un <b>vídeo o foto</b> desde la galería? Se hace desde el chat
          del bot: <b>/todos</b> con el vídeo en el pie (lo envía ya a todos) o{" "}
          <b>/diario</b> (envío diario). Aquí solo se manda texto.
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={(e) => setSoloActivos(e.target.checked)}
            className="h-4 w-4 accent-emerald-500"
          />
          Enviar solo a los activos (escribieron en 7 días)
        </label>
        <button
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          className="self-start inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
        >
          <Send size={16} />
          {enviando ? "Enviando…" : "Enviar a todos"}
        </button>
        {resultado && <p className="text-sm text-slate-200">{resultado}</p>}
      </div>

      <div className="bg-white/5 border border-white/15 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-200">
            💬 Chats {jugadores ? `(${jugadores.length})` : ""}
          </span>
          <button
            onClick={cargarJugadores}
            disabled={cargandoJug}
            className="shrink-0 inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
          >
            {cargandoJug ? "Cargando…" : jugadores ? "Actualizar" : "Ver chats"}
          </button>
        </div>

        {jugadores && jugadores.length === 0 && (
          <p className="text-sm text-slate-400">Aún no hay jugadores.</p>
        )}

        {jugadores && jugadores.length > 0 && (
          <div className="flex rounded-xl overflow-hidden border border-white/10 h-[70vh] sm:h-[520px]">
            {/* Lista de chats (izquierda) */}
            <div
              className={`${
                chatAbierto ? "hidden sm:flex" : "flex"
              } flex-col w-full sm:w-64 sm:border-r border-white/10 overflow-y-auto min-h-0 bg-black/20`}
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
                    {j.silenced && (
                      <span className="text-amber-300">silenciado · </span>
                    )}
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
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 bg-black/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => setChatAbierto(null)}
                        className="sm:hidden text-slate-300 hover:text-white shrink-0"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="text-sm text-white truncate">
                        {chatSel?.first_name || "Jugador"}{" "}
                        {chatSel?.username ? `(@${chatSel.username})` : ""}
                      </span>
                    </div>
                    {chatSel && (
                      <button
                        onClick={() =>
                          toggleSilencio(chatSel.chat_id, !chatSel.silenced)
                        }
                        className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg transition ${
                          chatSel.silenced
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "bg-white/10 hover:bg-white/20 text-white"
                        }`}
                      >
                        {chatSel.silenced ? "Reactivar" : "Silenciar"}
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
                    {cargandoChat ? (
                      <p className="text-xs text-slate-400">Cargando…</p>
                    ) : chatMsgs.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        Sin conversación guardada (o aún no ha escrito).
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

      <p className="text-xs text-slate-500">
        Consejo: no envíes demasiado seguido (para que Telegram no bloquee el
        bot). Cada jugador puede darse de baja con /stop, y tú puedes silenciar a
        un pesado arriba.
      </p>
    </main>
  );
}
