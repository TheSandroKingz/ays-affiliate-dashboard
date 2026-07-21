"use client";

import { useCallback, useEffect, useState } from "react";
import { eur } from "@/lib/format";

type Pago = { id: number; amount: number; date: string; name: string | null };

export default function PaymentHistory({ accessToken }: { accessToken: string }) {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pagos", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const body = res.ok ? await res.json().catch(() => null) : null;
      setPagos(Array.isArray(body?.pagos) ? body.pagos : []);
    } catch {
      setPagos([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Escucha pagos recién registrados para refrescar sin recargar.
  useEffect(() => {
    const onPago = () => load();
    window.addEventListener("pago-registrado", onPago);
    return () => window.removeEventListener("pago-registrado", onPago);
  }, [load]);

  const total = pagos.reduce((s, p) => s + p.amount, 0);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-white">Historial de pagos</h2>
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold whitespace-nowrap">
                Fecha
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                Afiliado
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Importe
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="border border-white/10 px-4 py-6 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : pagos.length === 0 ? (
              <tr>
                <td colSpan={3} className="border border-white/10 px-4 py-6 text-center text-slate-400">
                  Todavía no has registrado pagos.
                </td>
              </tr>
            ) : (
              pagos.map((p, i) => (
                <tr key={p.id} className={`text-white ${i % 2 === 1 ? "bg-white/[0.03]" : ""}`}>
                  <td className="border border-white/10 px-4 py-3 whitespace-nowrap text-slate-300">
                    {new Date(String(p.date).slice(0, 10) + "T00:00:00").toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  <td className="border border-white/10 px-4 py-3 whitespace-nowrap">
                    {p.name ?? "—"}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right font-medium">
                    {eur(p.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {pagos.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 font-semibold">
                <td className="border border-white/10 px-4 py-3 text-white" colSpan={2}>
                  Total pagado
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {eur(total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
