"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { TableSkeleton } from "@/components/Skeletons";

type StatRow = {
  user_id: string;
  display_name: string | null;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

type Totals = {
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

const emptyTotals: Totals = { commission: 0, clicks: 0, registrations: 0, ftd: 0 };

function fmt(n: number) {
  return n.toLocaleString("de-DE");
}

function money(n: number) {
  return "€" + n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export default function AdminStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatRow[] | null>(null);
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
        return;
      }

      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Error al cargar");
        setLoaded(true);
        return;
      }

      setStats(body.stats);
      setTotals(body.totals);
      setLoaded(true);
    }
    load();
  }, [router]);

  const affCards = [
    { label: "Clics", value: fmt(totals.clicks), color: "#9333ea" },
    { label: "Registros", value: fmt(totals.registrations), color: "#f59e0b" },
    { label: "FTD", value: fmt(totals.ftd), color: "#38bdf8" },
  ];

  if (!loaded) {
    return <TableSkeleton title="Mis Afiliados" cols={5} />;
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
          Lo que genera cada afiliado (para pagarle). Tu histórico de freshbet
          está en el Panel de inicio, aparte — no se suman.
        </p>
      </div>

      {/* Tarjetas de totales de afiliados */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                Comisión
              </th>
            </tr>
          </thead>
          <tbody>
            {!stats || stats.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
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
                  <td className="border border-white/10 px-4 py-3 text-white">
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
                  <td className="border border-white/10 px-4 py-3 text-right text-white font-medium">
                    {money(row.commission)}
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
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {money(totals.commission)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}
