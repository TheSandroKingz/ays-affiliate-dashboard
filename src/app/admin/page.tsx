"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { TableSkeleton } from "@/components/Skeletons";
import { eur } from "@/lib/format";

type StatRow = {
  user_id: string;
  display_name: string | null;
  commission: number; // lo que le pagas
  clicks: number;
  registrations: number;
  ftd: number;
  margin: number; // lo que te quedas tú
};

type Totals = {
  structurePaid: number;
  clicks: number;
  registrations: number;
  ftd: number;
  structureMargin: number;
};

const emptyTotals: Totals = {
  structurePaid: 0,
  clicks: 0,
  registrations: 0,
  ftd: 0,
  structureMargin: 0,
};

function fmt(n: number) {
  return n.toLocaleString("de-DE");
}

type Pending = { user_id: string; display_name: string | null };

export default function AdminStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatRow[] | null>(null);
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
        return;
      }
      setToken(session.access_token);

      const [res, pendRes] = await Promise.all([
        fetch("/api/admin/stats", {
          headers: { Authorization: "Bearer " + session.access_token },
        }),
        fetch("/api/admin/pending", {
          headers: { Authorization: "Bearer " + session.access_token },
        })
          .then((r) => (r.ok ? r.json() : { pending: [] }))
          .catch(() => ({ pending: [] })),
      ]);
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Error al cargar");
        setLoaded(true);
        return;
      }

      setStats(body.stats);
      setTotals(body.totals);
      setPending(pendRes.pending ?? []);
      setLoaded(true);
    }
    load();
  }, [router]);

  async function decidir(userId: string, action: "approve" | "reject") {
    if (!token) return;
    setBusyId(userId);
    const res = await fetch("/api/admin/pending", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ userId, action }),
    });
    setBusyId(null);
    if (res.ok) {
      setPending((prev) => prev.filter((p) => p.user_id !== userId));
    }
  }

  const affCards = [
    { label: "Clics", value: fmt(totals.clicks), color: "#9333ea" },
    { label: "Registros", value: fmt(totals.registrations), color: "#f59e0b" },
    { label: "FTD", value: fmt(totals.ftd), color: "#38bdf8" },
  ];

  if (!loaded) {
    return <TableSkeleton title="Mis Afiliados" cols={6} />;
  }

  if (error) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">Mis Afiliados</h1>
        <p className="text-red-400">Error: {error}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">Mis Afiliados</h1>
        <p className="text-sm text-slate-400 mt-1">
          Por cada FTD que traen, tú te quedas la diferencia entre tu CPA y el
          suyo. Aquí ves lo que le pagas a cada uno y lo que te queda a ti.
        </p>
      </div>

      {/* Solicitudes pendientes de aprobación (siempre visible) */}
      <div
        className={`rounded-xl p-5 border ${
          pending.length > 0
            ? "bg-amber-500/10 border-amber-400/40"
            : "bg-white/5 border-white/10"
        }`}
      >
        <p
          className={`text-sm font-semibold mb-3 ${
            pending.length > 0 ? "text-amber-300" : "text-slate-300"
          }`}
        >
          Solicitudes pendientes ({pending.length})
        </p>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">
            No hay solicitudes pendientes ahora mismo. Cuando alguien se
            registre, aparecerá aquí para que lo aceptes o rechaces.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((p) => (
              <div
                key={p.user_id}
                className="flex items-center justify-between gap-3 bg-black/30 rounded-lg px-3 py-2"
              >
                <span className="text-white text-sm truncate">
                  {p.display_name ?? "—"}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => decidir(p.user_id, "approve")}
                    disabled={busyId === p.user_id}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                  >
                    Aceptar
                  </button>
                  <button
                    onClick={() => decidir(p.user_id, "reject")}
                    disabled={busyId === p.user_id}
                    className="border border-red-400/40 text-red-300 hover:bg-red-500/10 disabled:opacity-60 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Margen total de la estructura (el total limpio está en el inicio) */}
      <div className="bg-white/10 backdrop-blur border border-emerald-400/50 rounded-xl p-7 max-w-lg shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]">
        <p className="text-sm font-medium text-slate-300 mb-3">Mi margen de afiliados</p>
        <p className="text-4xl font-bold text-white">{eur(totals.structureMargin)}</p>
      </div>

      {/* Tarjetas de actividad de la red */}
      <div className="grid grid-cols-3 gap-3">
        {affCards.map((card) => (
          <div
            key={card.label}
            className="p-4 rounded-xl border border-white/20 border-t-4 bg-black/40"
            style={{ borderTopColor: card.color }}
          >
            <p className="text-sm text-slate-300 mb-1">{card.label}</p>
            <p className="text-xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tabla por afiliado */}
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                Afiliado
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Clics
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Registros
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                FTD
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Le pago
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Mi margen
              </th>
            </tr>
          </thead>
          <tbody>
            {!stats || stats.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="border border-white/10 px-4 py-6 text-center text-slate-400"
                >
                  Todavía no hay estadísticas.
                </td>
              </tr>
            ) : (
              stats.map((row, i) => (
                <tr
                  key={row.user_id}
                  className={`${
                    i % 2 === 1 ? "bg-white/[0.03]" : ""
                  } hover:bg-white/10 transition-colors`}
                >
                  <td className="border border-white/10 px-4 py-3 text-white whitespace-nowrap">
                    {row.display_name ?? "—"}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {fmt(row.clicks)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {fmt(row.registrations)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {fmt(row.ftd)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-slate-300">
                    {eur(row.commission)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-emerald-400 font-semibold">
                    {eur(row.margin)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {stats && stats.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 font-semibold">
                <td className="border border-white/10 px-4 py-3 text-white">
                  Total
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {fmt(totals.clicks)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {fmt(totals.registrations)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {fmt(totals.ftd)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-slate-300">
                  {eur(totals.structurePaid)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-emerald-400">
                  {eur(totals.structureMargin)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}
