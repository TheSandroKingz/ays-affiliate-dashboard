"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DailyRow = {
  date: string;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

function fillMissingDays(rows: DailyRow[]): DailyRow[] {
  const map = new Map(rows.map((r) => [String(r.date).slice(0, 10), r]));
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const start = new Date(Date.UTC(ty, tm - 1, 1));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  const points: DailyRow[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key);
    points.push(
      row ?? { date: key, commission: 0, clicks: 0, registrations: 0, ftd: 0 }
    );
  }
  return points.reverse();
}

export default function MediaReportPage() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("affiliate_daily_stats")
        .select("date, commission, clicks, registrations, ftd")
        .eq("user_id", user.id)
        .order("date", { ascending: false });

      setRows(fillMissingDays((data as DailyRow[]) ?? []));
      setLoading(false);
    }
    loadData();
  }, []);

  if (loading) {
    return <p className="text-slate-300">Cargando...</p>;
  }

  const totals = rows.reduce(
    (acc, r) => ({commission: acc.commission + Number(r.commission),
      clicks: acc.clicks + r.clicks,
      registrations: acc.registrations + r.registrations,
      ftd: acc.ftd + r.ftd,
    }),
    { commission: 0, clicks: 0, registrations: 0, ftd: 0 }
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">Informe de Medios</h1>
        <button
          onClick={() => window.location.reload()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          Actualizar
        </button>
      </div>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                Día
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Comisión
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Clics
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Registros
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                FTD
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.date}
                className={`text-white ${
                  i % 2 === 1 ? "bg-white/[0.03]" : ""
                } hover:bg-white/10 transition-colors`}
              >
                <td className="border border-white/10 px-4 py-3">
                  {new Date(r.date).toLocaleDateString("es-ES")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  €{Number(r.commission).toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {r.clicks.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {r.registrations.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {r.ftd.toLocaleString("de-DE")}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="border border-white/10 px-4 py-6 text-center text-slate-400">
                  No hay datos todavía
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 text-white font-semibold">
                <td className="border border-white/10 px-4 py-3">Total</td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  €{totals.commission.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {totals.clicks.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {totals.registrations.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {totals.ftd.toLocaleString("de-DE")}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}