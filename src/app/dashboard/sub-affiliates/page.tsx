"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SubAffiliateRow = {
  id: string;
  displayName: string | null;
  commission: number;
};

export default function SubAffiliatesPage() {
  const [rows, setRows] = useState<SubAffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/subaffiliates", {
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

  const totalCommission = rows.reduce((sum, r) => sum + r.commission, 0);

  if (loading) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">Informe de Subafiliados</h1>
        <p className="text-slate-300">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-colgap-6">
      <h1 className="text-2xl font-semibold text-white">Informe de Subafiliados</h1>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                ID de Afiliado
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                Nombre del Afiliado
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Comisión
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="border border-white/10 px-4 py-6 text-center text-slate-400">
                  Aún no tienes subafiliados.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 1 ? "bg-white/[0.03]" : ""}>
                  <td className="border border-white/10 px-4 py-3">{r.id.slice(0, 8)}</td>
                  <td className="border border-white/10 px-4 py-3">{r.displayName ?? "—"}</td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    €{r.commission.toLocaleString("de-DE")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 font-semibold">
                <td className="border border-white/10 px-4 py-3" colSpan={2}>
                  Total
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  €{totalCommission.toLocaleString("de-DE")}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}