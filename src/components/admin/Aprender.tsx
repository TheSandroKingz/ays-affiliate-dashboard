"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type FaqItem = {
  id: string;
  tema: string;
  respuesta: string;
  enabled: boolean;
  created_at: string;
};
type Sugerencia = { tema: string; ejemplos: string[]; respuesta: string };

// "Aprender": analiza las conversaciones reales y propone respuestas; el dueño
// aprueba con un clic y se guardan (bot_faq) para que el bot las use. Incluye la
// gestión (añadir a mano / lista / borrar) plegada abajo. Todo en un solo sitio.
export default function Aprender() {
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [sugerencias, setSugerencias] = useState<Sugerencia[] | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  const [nuevoTema, setNuevoTema] = useState("");
  const [nuevaResp, setNuevaResp] = useState("");
  const [guardando, setGuardando] = useState(false);

  const token = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const cargarFaq = useCallback(async () => {
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/admin/faq", {
        headers: { Authorization: "Bearer " + t },
        cache: "no-store",
      });
      const b = await r.json();
      setFaq(b.faq ?? []);
      setSinTabla(b.aviso === "sin_tabla");
    } catch {
      /* nada */
    }
  }, [token]);

  useEffect(() => {
    cargarFaq();
  }, [cargarFaq]);

  async function analizar() {
    setAnalizando(true);
    setError(null);
    setSugerencias(null);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/admin/aprender", {
        headers: { Authorization: "Bearer " + t },
        cache: "no-store",
      });
      const b = await r.json();
      if (!r.ok) {
        setError(b.error || "No se pudo analizar.");
        return;
      }
      setSugerencias(b.sugerencias ?? []);
    } catch {
      setError("No se pudo analizar (revisa tu conexión).");
    } finally {
      setAnalizando(false);
    }
  }

  async function anadir(tema: string, respuesta: string) {
    const t = await token();
    if (!t) return false;
    const r = await fetch("/api/admin/faq", {
      method: "POST",
      headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
      body: JSON.stringify({ tema, respuesta }),
    });
    if (r.ok) {
      await cargarFaq();
      return true;
    }
    return false;
  }

  async function aprobar(s: Sugerencia, idx: number) {
    const ok = await anadir(s.tema, s.respuesta);
    if (ok) setSugerencias((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  function descartar(idx: number) {
    setSugerencias((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  async function anadirManual() {
    if (!nuevaResp.trim()) return;
    setGuardando(true);
    try {
      const ok = await anadir(nuevoTema.trim() || "General", nuevaResp.trim());
      if (ok) {
        setNuevoTema("");
        setNuevaResp("");
      }
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    const t = await token();
    if (!t) return;
    await fetch("/api/admin/faq?id=" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + t },
    });
    setFaq((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">🧠 Aprender</p>
          <p className="text-xs text-slate-400">
            Mira las conversaciones reales y te propone respuestas para las dudas
            que más se repiten. Lo que apruebes lo empieza a usar el bot.
          </p>
        </div>
        <button
          onClick={analizar}
          disabled={analizando}
          className="shrink-0 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {analizando ? "Analizando…" : "Analizar"}
        </button>
      </div>

      {sinTabla && (
        <p className="text-xs text-amber-300">
          Falta crear la tabla: ejecuta db/bot_faq.sql en Supabase y recarga.
        </p>
      )}
      {error && <p className="text-sm text-amber-300">{error}</p>}

      {sugerencias && sugerencias.length === 0 && (
        <p className="text-sm text-slate-400">
          Sin propuestas por ahora (poca conversación nueva o nada que destaque).
        </p>
      )}

      {sugerencias && sugerencias.length > 0 && (
        <div className="flex flex-col gap-3">
          {sugerencias.map((s, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-black/30 p-4 flex flex-col gap-2"
            >
              <p className="text-sm font-semibold text-emerald-300">{s.tema}</p>
              {s.ejemplos.length > 0 && (
                <p className="text-[11px] text-slate-500 italic line-clamp-2">
                  Ej: {s.ejemplos.map((e) => `“${e}”`).join("  ·  ")}
                </p>
              )}
              <p className="text-sm text-slate-200">{s.respuesta}</p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => aprobar(s, i)}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
                >
                  ✅ Añadir
                </button>
                <button
                  onClick={() => descartar(i)}
                  className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg transition"
                >
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gestión de las respuestas aprobadas: plegada para no ocupar. */}
      <details className="group rounded-xl border border-white/10 bg-black/20">
        <summary className="flex items-center justify-between cursor-pointer select-none list-none px-3 py-2 text-sm text-slate-300">
          <span>Respuestas que usa el bot ({faq.length})</span>
          <span className="text-slate-500 text-xs transition-transform group-open:rotate-180">
            ▼
          </span>
        </summary>
        <div className="px-3 pb-3 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <input
              value={nuevoTema}
              onChange={(e) => setNuevoTema(e.target.value)}
              placeholder="Tema (ej: retiros por PayPal)"
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-400/60"
            />
            <textarea
              value={nuevaResp}
              onChange={(e) => setNuevaResp(e.target.value)}
              rows={2}
              placeholder="Respuesta que dará el bot (honesta, sin prometer que ganan)"
              className="w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-400/60"
            />
            <button
              onClick={anadirManual}
              disabled={guardando || !nuevaResp.trim()}
              className="self-start bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
            >
              {guardando ? "Añadiendo…" : "Añadir a mano"}
            </button>
          </div>

          {faq.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aún no hay ninguna. Analiza arriba o añade una a mano.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {faq.map((f) => (
                <div
                  key={f.id}
                  className="rounded-lg border border-white/10 bg-black/30 p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-300">{f.tema}</p>
                    <p className="text-sm text-slate-200">{f.respuesta}</p>
                  </div>
                  <button
                    onClick={() => borrar(f.id)}
                    className="shrink-0 text-slate-500 hover:text-red-300 text-xs px-2 py-1 rounded transition"
                    title="Borrar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
