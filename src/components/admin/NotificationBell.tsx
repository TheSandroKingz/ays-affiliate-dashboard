"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, UserPlus, Coins } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Ev = {
  id: number;
  event_type: string;
  created_at: string;
  name: string | null;
  tracking_code: string | null;
  counted: boolean;
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [eventos, setEventos] = useState<Ev[]>([]);
  const [ftd24h, setFtd24h] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const h = { Authorization: "Bearer " + session.access_token };
      const [p, a] = await Promise.all([
        fetch("/api/admin/pending", { cache: "no-store", headers: h })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/admin/actividad", { cache: "no-store", headers: h })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      setPending(Array.isArray(p?.pending) ? p.pending.length : 0);
      const all: Ev[] = Array.isArray(a?.events) ? a.events : [];
      // FTD de las últimas 24 h sobre TODOS los eventos (no solo los mostrados).
      setFtd24h(
        all.filter(
          (e) =>
            e.event_type === "ftd" &&
            e.counted &&
            Date.now() - new Date(e.created_at).getTime() < 24 * 60 * 60 * 1000
        ).length
      );
      const evs = all
        .filter(
          (e) =>
            e.counted && (e.event_type === "ftd" || e.event_type === "registration")
        )
        .slice(0, 6);
      setEventos(evs);
    }
    load();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Novedades = solicitudes pendientes + FTD de las últimas 24 h.
  const total = pending + ftd24h;

  function cuando(iso: string) {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Novedades"
        className="relative flex items-center p-2 text-slate-300 hover:text-white"
      >
        <Bell size={18} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-black text-[10px] font-bold rounded-full min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center">
            {total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-black/95 backdrop-blur shadow-xl overflow-hidden">
          <p className="px-4 py-2 text-xs font-semibold text-slate-400 border-b border-white/10">
            Novedades
          </p>

          {pending > 0 && (
            <Link
              href="/admin/solicitudes"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-sm text-amber-200 hover:bg-white/5 border-b border-white/10"
            >
              <UserPlus size={16} className="text-amber-400 shrink-0" />
              <span>
                <b>{pending}</b> {pending === 1 ? "solicitud pendiente" : "solicitudes pendientes"}
              </span>
            </Link>
          )}

          {eventos.length === 0 && pending === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500 text-center">Sin novedades.</p>
          ) : (
            eventos.map((e) => (
              <Link
                key={e.id}
                href="/admin/actividad"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5"
              >
                {e.event_type === "ftd" ? (
                  <Coins size={16} className="text-sky-400 shrink-0" />
                ) : (
                  <UserPlus size={16} className="text-amber-400 shrink-0" />
                )}
                <span className="flex-1 min-w-0 truncate">
                  {e.event_type === "ftd" ? "FTD" : "Registro"} ·{" "}
                  <span className="text-white">{e.name ?? e.tracking_code ?? "—"}</span>
                </span>
                <span className="text-xs text-slate-500 shrink-0">{cuando(e.created_at)}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
