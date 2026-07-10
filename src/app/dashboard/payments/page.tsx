"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PaymentRow = {
  id: string;
  amount: number;
  date: string;
  status: string;
};

export default function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"facturas" | "historial">("facturas");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (res.ok) {
        const body = await res.json();
        setRows(body.rows ?? []);
      }

      setLoading(false);
    }

    load();
  }, []);

  const tabs = [
    { key: "facturas", label: "Facturas" },
    { key: "historial", label: "Historial de pagos" },
  ] as const;

  const latest = rows[0];

  if (loading) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">Pagos</h1>
        <p className="text-slate-300">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Pagos</h1>

      <div className="flex gap-2 border-b border-white/10 overflow-x-auto min-w-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === t.key
                ? "border-emerald-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "facturas" && (
        <div className="flex flex-col gap-6">
          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4">
            <p className="text-sm text-slate-400 uppercase tracking-wide font-semibold mb-2">
              Detalles recientes de la solicitud de pago
            </p>
            {latest ? (
              <div className="flex flex-wrap gap-6 text-sm text-slate-200">
                <span>ID de factura: {latest.id.slice(0, 8)}</span>
                <span>Fecha: {latest.date}</span>
                <span>Cantidad: €{Number(latest.amount).toLocaleString("de-DE")}</span>
                <span>Estado: {latest.status}</span>
              </div>
            ) : (
              <p className="text-slate-400">Aún no hay solicitudes de pago.</p>
            )}
          </div>

          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-white/10 text-slate-300 text-left">
                  <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                    ID de Factura
                  </th>
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
                    <td colSpan={4} className="border border-white/10 px-4 py-6 text-center text-slate-400">
                      Aún no tienes facturas.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 1 ? "bg-white/[0.03]" : ""}>
                      <td className="border border-white/10 px-4 py-3">{r.id.slice(0, 8)}</td>
                      <td className="border border-white/10 px-4 py-3">{r.date}</td>
                      <td className="border border-white/10 px-4 py-3 text-right">
                        €{Number(r.amount).toLocaleString("de-DE")}
                      </td>
                      <td className="border border-white/10 px-4 py-3 capitalize">{r.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "historial" && (
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
                  <tr key={r.id} className={i % 2 === 1 ? "bg-white/[0.03]" : ""}>
                    <td className="border border-white/10 px-4 py-3">{r.date}</td>
                    <td className="border border-white/10 px-4 py-3 text-right">
                      €{Number(r.amount).toLocaleString("de-DE")}
                    </td>
                    <td className="border border-white/10 px-4 py-3 capitalize">{r.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
