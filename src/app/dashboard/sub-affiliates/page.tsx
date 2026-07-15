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
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setLoading(false);
        return;
      }

      const { data: affiliateRow } = await supabase
        .from("affiliates")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (affiliateRow) {
        setAffiliateId(affiliateRow.id);
      }

      const res = await fetch("/api/subaffiliates", {
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
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Informe de Subafiliados</h1>

      {affiliateId && (
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 max-w-md">
          <p className="text-sm font-medium text-slate-300 mb-3">Promocionar</p>
          <p className="text-sm text-slate-300 mb-3">
            Comparte tu enlace único para invitar a otros y ganar recompensas.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={`https://ays-affiliate-dashboard.vercel.app/registro?ref=${affiliateId}`}
              className="flex-1 min-w-0 rounded-lg bg-white/10 border border-white/20 text-white text-xs px-3 py-2 truncate"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `https://ays-affiliate-dashboard.vercel.app/registro?ref=${affiliateId}`
                );
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 1500);
              }}
              className="shrink-0 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              {linkCopied ? "Copiado" : "Copiar enlace"}
            </button>
          </div>
        </div>
      )}

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
