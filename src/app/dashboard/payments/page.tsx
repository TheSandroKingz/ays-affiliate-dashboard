"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TableSkeleton } from "@/components/Skeletons";

type PaymentRow = {
  id: string;
  amount: number;
  date: string;
  status: string;
};

const ESTADOS: Record<string, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  processing: "Procesando",
  rejected: "Rechazado",
};

export default function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({ userId: session.user.id }),
      });

      if (res.ok) {
        const body = await res.json();
        setRows(body.rows ?? []);
      }

      setLoading(false);
    }

    load();
  }, []);

  

  

  if (loading) {
    return <TableSkeleton title="Pagos" cols={3} />;
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Pagos</h1>

      

      
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white/10 text-slate-300 text-left">
                <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                  Fecha
                </th>
                <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                  Cantidad
                </th>
                <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="border border-white/10 px-4 py-6 text-center text-slate-400">
                    Aún no hay pagos registrados.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className={`${i % 2 === 1 ? "bg-white/[0.03]" : ""} hover:bg-white/10 transition-colors`}>
                    <td className="border border-white/10 px-4 py-3">{new Date(r.date).toLocaleDateString("es-ES")}</td>
                    <td className="border border-white/10 px-4 py-3 text-right">
                      €{Number(r.amount).toLocaleString("de-DE")}
                    </td>
                    <td className="border border-white/10 px-4 py-3">{ESTADOS[(r.status ?? "").toLowerCase()] ?? r.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
  );
}
