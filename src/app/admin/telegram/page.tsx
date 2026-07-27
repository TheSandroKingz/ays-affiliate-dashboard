"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { Send } from "lucide-react";

export default function TelegramPage() {
  const router = useRouter();
  const [contactos, setContactos] = useState<number | null>(null);
  const [configurado, setConfigurado] = useState(true);
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

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
    }
  }, [router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function enviar() {
    if (!texto.trim() && !foto.trim()) return;
    if (
      !confirm(
        `¿Enviar este mensaje a ${contactos ?? 0} contacto(s) de Telegram?`
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
        body: JSON.stringify({ texto, foto: foto.trim() || undefined }),
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
        setFoto("");
        cargar();
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-white">Telegram</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manda un mensaje a todos los jugadores que se han unido al bot.
        </p>
      </div>

      {!configurado && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm text-amber-100">
          El bot aún no está configurado en el servidor (falta{" "}
          <span className="font-mono">TELEGRAM_BOT_TOKEN</span> en Vercel).
        </div>
      )}

      <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-slate-300">
        📇 Contactos activos:{" "}
        <b className="text-white">{contactos === null ? "…" : contactos}</b>
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
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1">
            Foto (opcional) — URL de una imagen
          </label>
          <input
            value={foto}
            onChange={(e) => setFoto(e.target.value)}
            placeholder="https://…/imagen.jpg"
            className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-400/60"
          />
        </div>
        <button
          onClick={enviar}
          disabled={enviando || (!texto.trim() && !foto.trim())}
          className="self-start inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
        >
          <Send size={16} />
          {enviando ? "Enviando…" : "Enviar a todos"}
        </button>
        {resultado && <p className="text-sm text-slate-200">{resultado}</p>}
      </div>

      <p className="text-xs text-slate-500">
        Consejo: no envíes demasiado seguido (juego responsable y para que
        Telegram no bloquee el bot). Cada jugador puede darse de baja con /stop.
      </p>
    </main>
  );
}
