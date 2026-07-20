"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { TableSkeleton } from "@/components/Skeletons";
import LoadError from "@/components/LoadError";
import { eur } from "@/lib/format";

type Mes = {
  mes: string;
  ftd: number;
  structurePaid: number;
  totalClean: number;
  clicks: number;
  registrations: number;
};

function nombreMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MemoriaPage() {
  const router = useRouter();
  const [meses, setMeses] = useState<Mes[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
        return;
      }
      const res = await fetch("/api/admin/memoria", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = await res.json();
      setMeses(Array.isArray(body.meses) ? body.meses : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <TableSkeleton title="Memoria del negocio" cols={4} />;
  if (error)
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">Memoria del negocio</h1>
        <LoadError onRetry={() => load()} />
      </main>
    );

  const totalBeneficio = meses.reduce((s, m) => s + m.totalClean, 0);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Memoria del negocio</h1>
          <p className="text-sm text-slate-400 mt-1">
            Cómo ha ido cada mes: FTDs, lo pagado a afiliados y tu beneficio.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold whitespace-nowrap">
                Mes
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                FTD
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Pagado a afiliados
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Mi beneficio
              </th>
            </tr>
          </thead>
          <tbody>
            {meses.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-white/10 px-4 py-6 text-center text-slate-400">
                  Todavía no hay meses con actividad.
                </td>
              </tr>
            ) : (
              meses.map((m, i) => (
                <tr
                  key={m.mes}
                  className={`text-white ${i % 2 === 1 ? "bg-white/[0.03]" : ""} hover:bg-white/10 transition-colors`}
                >
                  <td className="border border-white/10 px-4 py-3 whitespace-nowrap font-medium">
                    {nombreMes(m.mes)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    {m.ftd.toLocaleString("de-DE")}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-slate-300">
                    {eur(m.structurePaid)}
                  </td>
                  <td
                    className={`border border-white/10 px-4 py-3 text-right font-semibold ${
                      m.totalClean < 0 ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {eur(m.totalClean)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {meses.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 font-semibold">
                <td className="border border-white/10 px-4 py-3 text-white" colSpan={3}>
                  Beneficio total (histórico)
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-emerald-400">
                  {eur(totalBeneficio)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}
