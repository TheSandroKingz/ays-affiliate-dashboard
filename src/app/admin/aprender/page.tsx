"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Sugerencia = { tema: string; ejemplos: string[]; respuesta: string };

export default function AprenderPage() {
  const [sugerencias, setSugerencias] = useState<Sugerencia[] | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anadidas, setAnadidas] = useState(0);

  const token = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  async function analizar() {
    setAnalizando(true);
    setError(null);
    setSugerencias(null);
    setAnadidas(0);
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

  async function aprobar(s: Sugerencia, idx: number) {
    const t = await token();
    if (!t) return;
    const r = await fetch("/api/admin/faq", {
      method: "POST",
      headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
      body: JSON.stringify({ tema: s.tema, respuesta: s.respuesta }),
    });
    if (r.ok) {
      setSugerencias((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
      setAnadidas((n) => n + 1);
    }
  }

  function descartar(idx: number) {
    setSugerencias((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  return (
    <main className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Aprender</h1>
        <p className="text-sm text-slate-400 mt-1">
          Lee las conversaciones reales y te propone respuestas para las dudas que
          más se repiten. Lo que apruebes lo empieza a usar el bot (lo verás y
          gestionarás en <span className="text-slate-300">Telegram</span>).
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              Analizar conversaciones
            </h2>
            <p className="text-xs text-slate-400">
              Mira los últimos días y propone respuestas. No cambia nada hasta que
              tú apruebes.
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

        {error && <p className="text-sm text-amber-300">{error}</p>}

        {anadidas > 0 && (
          <p className="text-sm text-emerald-300">
            ✅ {anadidas} añadida{anadidas > 1 ? "s" : ""} — el bot ya las usa (las
            ves en Telegram).
          </p>
        )}

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
      </section>
    </main>
  );
}
