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

export default function MediaReportPage() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("affiliate_daily_stats")
        .select("date, commission, clicks, registrations, ftd")
        .eq("user_id", user.id)
        .order("date", { ascending: false });

      if (data) {
        setRows(data as DailyRow[]);
      }
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
      <h1 className="text-2xl font-semibold text-white">Informe de Medios</h1>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto">
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