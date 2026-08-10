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

// Gestión de las "Respuestas que usa el bot" (bot_faq): añadir a mano, listar y
// borrar. Las que apruebas en "Aprender" también salen aquí. Reutilizable.
export default function FaqManager() {
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [cargando, setCargando] = useState(true);
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

  const cargar = useCallback(async () => {
    setCargando(true);
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
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function anadir() {
    if (!nuevaResp.trim()) return;
    setGuardando(true);
    try {
      const t = await token();
      if (!t) return;
      const r = await fetch("/api/admin/faq", {
        method: "POST",
        headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: JSON.stringify({ tema: nuevoTema.trim() || "General", respuesta: nuevaResp.trim() }),
      });
      if (r.ok) {
        setNuevoTema("");
        setNuevaResp("");
        await cargar();
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
    <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-slate-200">
          🧠 Respuestas que usa el bot ({faq.length})
        </p>
        <p className="text-xs text-slate-400">
          Respuestas fijas que el bot usa cuando vienen a cuento. Las apruebas en
          &quot;Aprender&quot; o las añades aquí a mano.
        </p>
      </div>

      {sinTabla && (
        <p className="text-xs text-amber-300">
          Falta crear la tabla: ejecuta db/bot_faq.sql en Supabase y recarga.
        </p>
      )}

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
          onClick={anadir}
          disabled={guardando || !nuevaResp.trim()}
          className="self-start bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
        >
          {guardando ? "Añadiendo…" : "Añadir respuesta"}
        </button>
      </div>

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : faq.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aún no hay ninguna. Añade una aquí o apruébalas en &quot;Aprender&quot;.
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
  );
}
