"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { TableSkeleton } from "@/components/Skeletons";

type StatRow = {
  user_id: string;
  display_name: string | null;
  balance: number;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

export default function AdminStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatRow[] | null>(null);
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
      setLoaded(true);
    }
    load();
  }, [router]);

  const totals = (stats ?? []).reduce(
    (acc, r) => ({
      commission: acc.commission + r.commission,
      clicks: acc.clicks + r.clicks,
      registrations: acc.registrations + r.registrations,
      ftd: acc.ftd + r.ftd,
    }),
    { commission: 0, clicks: 0, registrations: 0, ftd: 0 }
  );

  if (!loaded) {
    return <TableSkeleton title="Estadísticas de Afiliados" cols={6} />;
  }

  if (error) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">
          Estadísticas de Afiliados
        </h1>
        <p className="text-red-400">Error: {error}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">
        Estadísticas de Afiliados
      </h1>

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
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Balance
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
                  className={`${i % 2 === 1 ? "bg-white/[0.03]" : ""} hover:bg-white/10 transition-colors`}
                >
                  <td className="border border-white/10 px-4 py-3 text-white">
                    {row.display_name ?? "—"}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {row.clicks.toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {row.registrations.toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {row.ftd.toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white font-medium">
                    €{row.commission.toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    €{row.balance.toLocaleString("de-DE")}
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
                  {totals.clicks.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {totals.registrations.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {totals.ftd.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  €{totals.commission.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  —
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}
