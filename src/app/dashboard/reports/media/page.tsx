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
      }const { data } = await supabase
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
    (acc, r) => ({
      commission: acc.commission + Number(r.commission),
      clicks: acc.clicks + r.clicks,
      registrations: acc.registrations + r.registrations,
      ftd: acc.ftd + r.ftd,
    }),
    { commission: 0, clicks: 0, registrations: 0, ftd: 0 }
  );return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Informe de Medios</h1>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-slate-300 text-left">
              <th className="px-4 py-3 font-medium">Día</th>
              <th className="px-4 py-3 font-medium">Comisión</th>
              <th className="px-4 py-3 font-medium">Clics</th>
              <th className="px-4 py-3 font-medium">Registros</th>
              <th className="px-4 py-3 font-medium">FTD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-b border-white/5 text-white">
                <td className="px-4 py-3">
                  {new Date(r.date).toLocaleDateString("en-US")}
                </td>
                <td className="px-4 py-3">
                  €{Number(r.commission).toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  {r.clicks.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  {r.registrations.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  {r.ftd.toLocaleString("de-DE")}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No hay datos todavia
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-white/5 text-white font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3">
                  €{totals.commission.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  {totals.clicks.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  {totals.registrations.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
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