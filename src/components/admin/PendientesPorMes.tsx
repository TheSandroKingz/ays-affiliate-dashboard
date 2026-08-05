"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { eur } from "@/lib/format";

type Fila = {
  mes: string; // YYYY-MM
  userId: string;
  nombre: string;
  gano: number;
  pagado: number;
  pendiente: number;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
function etiquetaMes(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MESES[(m || 1) - 1]} ${y}`;
}

export default function PendientesPorMes({ accessToken }: { accessToken: string }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pendientes", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const body = res.ok ? await res.json().catch(() => null) : null;
      setFilas(Array.isArray(body?.filas) ? body.filas : []);
    } catch {
      setFilas([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Al registrar un pago, refrescamos para que cambie a "Pagado".
  useEffect(() => {
    const onPago = () => load();
    window.addEventListener("pago-registrado", onPago);
    return () => window.removeEventListener("pago-registrado", onPago);
  }, [load]);

  // Agrupamos por mes conservando el orden (ya viene mes desc).
  const meses: string[] = [];
  const porMes: Record<string, Fila[]> = {};
  for (const f of filas) {
    if (!porMes[f.mes]) {
      porMes[f.mes] = [];
      meses.push(f.mes);
    }
    porMes[f.mes].push(f);
  }
  const totalPendiente = filas.reduce((s, f) => s + f.pendiente, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Pendiente por mes</h2>
        {totalPendiente > 0 && (
          <span className="text-sm text-amber-300 font-semibold">
            Debes en total {eur(totalPendiente)}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-slate-400">Aún no hay comisiones que pagar.</p>
      ) : (
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-white/10 text-slate-300 text-left">
                <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                  Afiliado
                </th>
                <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                  Ganó
                </th>
                <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {meses.map((mes) => (
                <Fragment key={mes}>
                  <tr>
                    <td
                      colSpan={3}
                      className="bg-black/40 border border-white/10 px-4 py-2 text-xs font-semibold text-emerald-300 uppercase tracking-wide"
                    >
                      {etiquetaMes(mes)}
                    </td>
                  </tr>
                  {porMes[mes].map((f) => (
                    <tr key={f.userId + mes} className="text-white hover:bg-white/5">
                      <td className="border border-white/10 px-4 py-3">{f.nombre}</td>
                      <td className="border border-white/10 px-4 py-3 text-right">
                        {eur(f.gano)}
                      </td>
                      <td className="border border-white/10 px-4 py-3 text-right">
                        {f.pendiente > 0 ? (
                          <span className="text-amber-300 font-semibold">
                            Pendiente {eur(f.pendiente)}
                          </span>
                        ) : (
                          <span className="text-emerald-400">Pagado ✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
