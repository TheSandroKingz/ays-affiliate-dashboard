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
        setLoading(false);return;
      }
      const { data } = await supabase
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
  }

  const totals = rows.reduce(
    (acc, r) => ({
      commission_count: acc.commission_count + Number(r.commission_count),
      commission_amount: acc.commission_amount + Number(r.commission_amount),deposits: acc.deposits + Number(r.deposits),
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

  const totalNetDeposit = totals.deposits - totals.withdrawals;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Informe de Actividad</h1>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                ID de Usuario
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Cantidad de Comisiones
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Monto de Comisión
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Depósitos
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Cantidad de Depósitos
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Retiros
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Depósito Neto
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                NGR
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const netDeposit = Number(r.deposits) - Number(r.withdrawals);
              return (
                <tr
                  key={r.customer_id}
                  className={`text-white ${
                    i % 2 === 1 ? "bg-white/[0.03]" : ""
                  } hover:bg-white/10 transition-colors`}
                >
                  <td className="border border-white/10 px-4 py-3">
                    {r.customer_id}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    {r.commission_count.toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    €{Number(r.commission_amount).toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    €{Number(r.deposits).toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    {r.deposit_count.toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">€{Number(r.withdrawals).toLocaleString("de-DE")}</td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    €{netDeposit.toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    €{Number(r.ngr).toLocaleString("de-DE")}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="border border-white/10 px-4 py-6 text-center text-slate-400">
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
                  {totals.commission_count.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  €{totals.commission_amount.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  €{totals.deposits.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">{totals.deposit_count.toLocaleString("de-DE")}</td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  €{totals.withdrawals.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  €{totalNetDeposit.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
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