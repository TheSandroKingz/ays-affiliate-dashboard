"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ActivityRow = {
  customer_id: string;
  commission_count: number;
  commission_amount: number;
  deposits: number;
  deposit_count: number;
  withdrawals: number;
  ngr: number;
};

export default function ActivityReportPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
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
        .from("affiliate_activity")
        .select(
          "customer_id, commission_count, commission_amount, deposits, deposit_count, withdrawals, ngr"
        )
        .eq("user_id", user.id)
        .order("customer_id", { ascending: true });

      if (data) {
        setRows(data as ActivityRow[]);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  if (loading) {
    return <p className="text-slate-300">Cargando...</p>;
  }const totals = rows.reduce(
    (acc, r) => ({
      commission_count: acc.commission_count + Number(r.commission_count),
      commission_amount: acc.commission_amount + Number(r.commission_amount),
      deposits: acc.deposits + Number(r.deposits),
      deposit_count: acc.deposit_count + Number(r.deposit_count),
      withdrawals: acc.withdrawals + Number(r.withdrawals),
      ngr: acc.ngr + Number(r.ngr),
    }),
    {
      commission_count: 0,
      commission_amount: 0,
      deposits: 0,
      deposit_count: 0,
      withdrawals: 0,
      ngr: 0,
    }
  );

  const totalNetDeposit = totals.deposits - totals.withdrawals;return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Activity Report</h1>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-slate-300 text-left">
              <th className="px-4 py-3 font-medium">User ID</th>
              <th className="px-4 py-3 font-medium">Commission Count</th>
              <th className="px-4 py-3 font-medium">Commission Amount</th>
              <th className="px-4 py-3 font-medium">Deposits</th>
              <th className="px-4 py-3 font-medium">Deposit Count</th>
              <th className="px-4 py-3 font-medium">Withdrawals</th>
              <th className="px-4 py-3 font-medium">Net Deposit</th>
              <th className="px-4 py-3 font-medium">NGR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const netDeposit = Number(r.deposits) - Number(r.withdrawals);
              return (
                <tr key={r.customer_id} className="border-b border-white/5 text-white">
                  <td className="px-4 py-3">{r.customer_id}</td>
                  <td className="px-4 py-3">
                    {r.commission_count.toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-3">€{Number(r.commission_amount).toLocaleString("de-DE")}</td>
                  <td className="px-4 py-3">
                    €{Number(r.deposits).toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-3">
                    {r.deposit_count.toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-3">
                    €{Number(r.withdrawals).toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-3">
                    €{netDeposit.toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-3">
                    €{Number(r.ngr).toLocaleString("de-DE")}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
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
                  {totals.commission_count.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  €{totals.commission_amount.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  €{totals.deposits.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  {totals.deposit_count.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  €{totals.withdrawals.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  €{totalNetDeposit.toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-3">
                  €{totals.ngr.toLocaleString("de-DE")}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}