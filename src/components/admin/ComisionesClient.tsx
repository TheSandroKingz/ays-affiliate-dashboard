"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { eur } from "@/lib/format";

type Affiliate = {
  id: string;
  user_id: string;
  display_name: string | null;
  cpa_spain: number | null;
  cpa_other: number | null;
  subaffiliate_percent: number | null;
  wallet_erc20: string | null;
  wallet_trc20: string | null;
};

export default function ComisionesClient({
  affiliates,
  accessToken,
}: {
  affiliates: Affiliate[];
  accessToken: string;
}) {
  const [rows, setRows] = useState(
    affiliates.map((a) => ({
      id: a.id,
      userId: a.user_id,
      display_name: a.display_name ?? "Sin nombre",
      cpaSpain: a.cpa_spain ?? 85,
      cpaOther: a.cpa_other ?? 85,
      subaffiliatePercent: a.subaffiliate_percent ?? 5,
      walletErc20: a.wallet_erc20 ?? "",
      walletTrc20: a.wallet_trc20 ?? "",
    }))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Registrar pago: importe por afiliado y estado de guardado.
  const [pagoImporte, setPagoImporte] = useState<Record<string, string>>({});
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [pagoMsg, setPagoMsg] = useState<{ id: string; texto: string; ok: boolean } | null>(null);
  // Saldos del mes por afiliado (gana / pagado) para pagar lo pendiente.
  const [saldos, setSaldos] = useState<Record<string, { owed: number; paid: number }>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const cargarSaldos = useCallback(async () => {
    const res = await fetch("/api/admin/saldos", {
      cache: "no-store",
      headers: { Authorization: "Bearer " + accessToken },
    }).catch(() => null);
    if (res && res.ok) {
      const b = await res.json().catch(() => null);
      if (b && b.saldos) setSaldos(b.saldos);
    }
  }, [accessToken]);

  useEffect(() => {
    cargarSaldos();
  }, [cargarSaldos]);

  async function registrarPago(id: string, userId: string) {
    const importe = Number((pagoImporte[id] ?? "").replace(",", "."));
    if (!Number.isFinite(importe) || importe <= 0) {
      setPagoMsg({ id, texto: "Pon un importe válido.", ok: false });
      return;
    }
    setPagandoId(id);
    setPagoMsg(null);
    const res = await fetch("/api/admin/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken,
      },
      body: JSON.stringify({ userId, amount: importe }),
    });
    setPagandoId(null);
    if (res.ok) {
      setPagoMsg({ id, texto: `Pago de €${importe} registrado ✓`, ok: true });
      setPagoImporte((p) => ({ ...p, [id]: "" }));
      cargarSaldos(); // refrescar pagado/pendiente
      window.dispatchEvent(new CustomEvent("pago-registrado")); // refrescar historial
    } else {
      const b = await res.json().catch(() => ({}));
      setPagoMsg({ id, texto: b.error || "Error al registrar", ok: false });
    }
  }

  async function copiar(texto: string, key: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }

  function updateRow(id: string, field: string, value: number) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  async function saveRow(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    setSavingId(id);
    setResult(null);

    const res = await fetch("/api/admin/comisiones", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken,
      },
      body: JSON.stringify({
        affiliateId: row.id,
        cpaSpain: row.cpaSpain,
        cpaOther: row.cpaOther,
        subaffiliatePercent: row.subaffiliatePercent,
      }),
    });

    setSavingId(null);
    setResult({ id, ok: res.ok });
    if (!res.ok) {
      console.error(await res.json());
    }
  }

  const inputClass =
    "mt-1 block w-full rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-white/10 text-slate-300 text-left">
            <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
              Afiliado
            </th>
            <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
              CPA
            </th>
            <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
              %
            </th>
            <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
              Pendiente
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const s = saldos[row.userId];
            const pending = s ? Math.max(0, s.owed - s.paid) : 0;
            const abierto = expandedId === row.id;
            return (
              <Fragment key={row.id}>
                <tr
                  onClick={() => setExpandedId(abierto ? null : row.id)}
                  className="cursor-pointer hover:bg-white/10 transition-colors"
                >
                  <td className="border border-white/10 px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2 text-emerald-400 font-medium">
                      <ChevronDown
                        size={15}
                        className={`transition-transform ${abierto ? "rotate-180" : ""}`}
                      />
                      {row.display_name}
                    </span>
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {eur(row.cpaSpain)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {row.subaffiliatePercent}%
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    {pending > 0 ? (
                      <span className="text-amber-300 font-semibold">{eur(pending)}</span>
                    ) : (
                      <span className="text-emerald-400">Al día</span>
                    )}
                  </td>
                </tr>

                {abierto && (
                  <tr>
                    <td colSpan={4} className="border border-white/10 bg-black/30 p-4 sm:p-6">
                      <div className="flex flex-col gap-4 max-w-2xl">
                        {/* CPA y % */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <label className="text-sm text-slate-200">
                            CPA España (€)
                            <input
                              type="number"
                              value={row.cpaSpain}
                              onChange={(e) => updateRow(row.id, "cpaSpain", Number(e.target.value))}
                              className={inputClass}
                            />
                          </label>
                          <label className="text-sm text-slate-200">
                            CPA Otros (€)
                            <input
                              type="number"
                              value={row.cpaOther}
                              onChange={(e) => updateRow(row.id, "cpaOther", Number(e.target.value))}
                              className={inputClass}
                            />
                          </label>
                          <label className="text-sm text-slate-200">
                            % Subafiliado
                            <input
                              type="number"
                              value={row.subaffiliatePercent}
                              onChange={(e) => updateRow(row.id, "subaffiliatePercent", Number(e.target.value))}
                              className={inputClass}
                            />
                          </label>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => saveRow(row.id)}
                            disabled={savingId === row.id}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                          >
                            {savingId === row.id ? "Guardando..." : "Guardar"}
                          </button>
                          {result?.id === row.id && savingId !== row.id &&
                            (result.ok ? (
                              <span className="text-emerald-400 text-sm">Guardado ✓</span>
                            ) : (
                              <span className="text-red-400 text-sm">Error al guardar</span>
                            ))}
                        </div>

                        {/* Pago del mes */}
                        <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                          <p className="text-xs font-medium text-slate-400">Pago del mes</p>
                          {s && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                              <span className="text-slate-300">Gana <b className="text-white">{eur(s.owed)}</b></span>
                              <span className="text-slate-300">Pagado <b className="text-white">{eur(s.paid)}</b></span>
                              {pending > 0 ? (
                                <span className="inline-flex items-center rounded-md bg-amber-500/15 border border-amber-400/40 px-2 py-0.5 text-amber-200 font-semibold">
                                  Pendiente {eur(pending)}
                                </span>
                              ) : (
                                <span className="text-emerald-400">Al día ✓</span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              placeholder="Importe €"
                              value={pagoImporte[row.id] ?? ""}
                              onChange={(e) => setPagoImporte((p) => ({ ...p, [row.id]: e.target.value }))}
                              className="flex-1 min-w-0 rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <button
                              onClick={() => registrarPago(row.id, row.userId)}
                              disabled={pagandoId === row.id}
                              className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                            >
                              {pagandoId === row.id ? "..." : "Registrar"}
                            </button>
                          </div>
                          {pending > 0 && (
                            <button
                              onClick={() => setPagoImporte((p) => ({ ...p, [row.id]: String(pending) }))}
                              className="self-start text-xs text-emerald-400 hover:text-emerald-300"
                            >
                              Poner lo pendiente ({eur(pending)})
                            </button>
                          )}
                          {pagoMsg?.id === row.id && (
                            <span className={`text-xs ${pagoMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                              {pagoMsg.texto}
                            </span>
                          )}
                        </div>

                        {/* Datos de cobro */}
                        {(row.walletErc20 || row.walletTrc20) && (
                          <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                            <p className="text-xs font-medium text-slate-400">Datos de cobro (USDT)</p>
                            {row.walletErc20 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 shrink-0 w-14">ERC-20</span>
                                <span className="text-xs text-white break-all flex-1 min-w-0">{row.walletErc20}</span>
                                <button onClick={() => copiar(row.walletErc20, row.id + "e")} className="shrink-0 text-xs text-emerald-400 hover:text-emerald-300">
                                  {copied === row.id + "e" ? "Copiado" : "Copiar"}
                                </button>
                              </div>
                            )}
                            {row.walletTrc20 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 shrink-0 w-14">TRC-20</span>
                                <span className="text-xs text-white break-all flex-1 min-w-0">{row.walletTrc20}</span>
                                <button onClick={() => copiar(row.walletTrc20, row.id + "t")} className="shrink-0 text-xs text-emerald-400 hover:text-emerald-300">
                                  {copied === row.id + "t" ? "Copiado" : "Copiar"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
