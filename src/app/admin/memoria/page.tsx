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
  penalizacion: number;
  beneficio: number;
  clicks: number;
  registrations: number;
  gastos: number;
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
  // Edición de la penalización de un mes (dinero restado por el casino).
  const [editMes, setEditMes] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [savingMes, setSavingMes] = useState<string | null>(null);

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

  // Guardar la penalización del mes que se está editando.
  async function guardarPenal(mes: string) {
    const importe = Number(editVal.replace(",", ".")) || 0;
    setSavingMes(mes);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/admin/memoria", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({ mes, importe }),
      });
      if (res.ok) {
        // Actualiza en local sin recargar toda la tabla.
        setMeses((prev) =>
          prev.map((m) =>
            m.mes === mes
              ? { ...m, penalizacion: importe, beneficio: m.totalClean - importe }
              : m
          )
        );
        setEditMes(null);
      }
    } finally {
      setSavingMes(null);
    }
  }

  function empezarEdicion(m: Mes) {
    setEditMes(m.mes);
    setEditVal(m.penalizacion ? String(m.penalizacion) : "");
  }

  if (loading) return <TableSkeleton title="Memoria del negocio" cols={4} />;
  if (error)
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">Memoria del negocio</h1>
        <LoadError onRetry={() => load()} />
      </main>
    );

  const totalBeneficio = meses.reduce((s, m) => s + m.beneficio, 0);
  const totalPagado = meses.reduce((s, m) => s + m.structurePaid, 0);
  const totalGastos = meses.reduce((s, m) => s + (m.gastos ?? 0), 0);
  const totalPenal = meses.reduce((s, m) => s + (m.penalizacion ?? 0), 0);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Memoria del negocio</h1>
          <p className="text-sm text-slate-400 mt-1">
            Cómo ha ido cada mes: FTDs, lo pagado a afiliados, gastos, lo que te restó el casino y tu beneficio.
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
                Gastos
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right whitespace-nowrap">
                Dinero restado
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Mi beneficio
              </th>
            </tr>
          </thead>
          <tbody>
            {meses.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-white/10 px-4 py-6 text-center text-slate-400">
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
                  <td className="border border-white/10 px-4 py-3 text-right text-amber-300">
                    {m.gastos ? eur(m.gastos) : "—"}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    {editMes === m.mes ? (
                      <span className="inline-flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          autoFocus
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") guardarPenal(m.mes);
                            if (e.key === "Escape") setEditMes(null);
                          }}
                          placeholder="0"
                          className="w-24 rounded-md bg-white/10 border border-white/20 text-white text-sm px-2 py-1 text-right [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          onClick={() => guardarPenal(m.mes)}
                          disabled={savingMes === m.mes}
                          className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-2 py-1"
                          title="Guardar"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEditMes(null)}
                          className="rounded-md bg-white/10 hover:bg-white/20 text-slate-300 text-xs px-2 py-1"
                          title="Cancelar"
                        >
                          ✕
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => empezarEdicion(m)}
                        className={`hover:underline decoration-dotted underline-offset-4 ${
                          m.penalizacion ? "text-red-400 font-medium" : "text-slate-500"
                        }`}
                        title="Editar dinero restado por el casino"
                      >
                        {m.penalizacion ? `−${eur(m.penalizacion)}` : "+ añadir"}
                      </button>
                    )}
                  </td>
                  <td
                    className={`border border-white/10 px-4 py-3 text-right font-semibold ${
                      m.beneficio < 0 ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {eur(m.beneficio)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {meses.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 font-semibold">
                <td className="border border-white/10 px-4 py-3 text-white" colSpan={2}>
                  Total (histórico)
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-slate-300">
                  {eur(totalPagado)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-amber-300">
                  {totalGastos ? eur(totalGastos) : "—"}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-red-400">
                  {totalPenal ? `−${eur(totalPenal)}` : "—"}
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
