"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TableSkeleton } from "@/components/Skeletons";
import LoadError from "@/components/LoadError";
import { eur } from "@/lib/format";

type SubAffiliateRow = {
  id: string;
  displayName: string | null;
  commission: number;
};

export default function SubAffiliatesPage() {
  const [rows, setRows] = useState<SubAffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [percent, setPercent] = useState(5);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setError(true);
        return;
      }

      // Las dos peticiones solo dependen de la sesión, no entre sí:
      // en paralelo para que la página cargue antes.
      const [affiliateRes, subRes] = await Promise.all([
        supabase
          .from("affiliates")
          .select("id, subaffiliate_percent")
          .eq("user_id", session.user.id)
          .maybeSingle(),
        fetch("/api/subaffiliates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + session.access_token,
          },
          body: JSON.stringify({ userId: session.user.id }),
        }),
      ]);

      // Si no pudimos leer tu perfil o la lista de subs, avisamos en vez de
      // mostrar "no tienes subafiliados" (que sería falso si solo falló la red).
      if (affiliateRes.error || !affiliateRes.data || !subRes.ok) {
        setError(true);
        return;
      }
      const subBody = await subRes.json().catch(() => null);
      if (!subBody || !Array.isArray(subBody.rows)) {
        setError(true);
        return;
      }

      setAffiliateId(affiliateRes.data.id);
      setPercent(affiliateRes.data.subaffiliate_percent ?? 5);
      setRows(subBody.rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  const totalCommission = rows.reduce((sum, r) => sum + r.commission, 0);

  if (loading) {
    return <TableSkeleton title="Subafiliados" cols={3} />;
  }

  if (error) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">Subafiliados</h1>
        <LoadError onRetry={load} />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">Subafiliados</h1>

      {affiliateId && (
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 max-w-md">
          <p className="text-sm font-medium text-slate-300 mb-3">Promocionar</p>
          <p className="text-sm text-slate-300 mb-3">
            Comparte tu enlace único para invitar a otros afiliados y gana un {percent}% de sus comisiones.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={`${origin}/registro?ref=${affiliateId}`}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-lg bg-white/10 border border-white/20 text-white text-xs px-3 py-2 truncate"
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${origin}/registro?ref=${affiliateId}`
                  );
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
                } catch {}
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
                <tr key={r.id} className={`${i % 2 === 1 ? "bg-white/[0.03]" : ""} hover:bg-white/10 transition-colors`}>
                  <td className="border border-white/10 px-4 py-3 text-white">{r.id.slice(0, 8)}</td>
                  <td className="border border-white/10 px-4 py-3 text-white">{r.displayName ?? "—"}</td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white font-medium">
                    {eur(r.commission)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 font-semibold">
                <td className="border border-white/10 px-4 py-3 text-white" colSpan={2}>
                  Total
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {eur(totalCommission)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}
