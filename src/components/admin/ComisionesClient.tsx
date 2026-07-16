"use client";

import { useState } from "react";

type Affiliate = {
  id: string;
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rows.map((row) => (
        <div
          key={row.id}
          className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 flex flex-col gap-4"
        >
          <h3 className="text-lg font-semibold text-white">
            {row.display_name}
          </h3>

          <div className="flex flex-col gap-3">
            <label className="text-sm text-slate-200">
              CPA España (€)
              <input
                type="number"
                value={row.cpaSpain}
                onChange={(e) =>
                  updateRow(row.id, "cpaSpain", Number(e.target.value))
                }
                className={inputClass}
              />
            </label>

            <label className="text-sm text-slate-200">
              CPA Otros Países (€)
              <input
                type="number"
                value={row.cpaOther}
                onChange={(e) =>
                  updateRow(row.id, "cpaOther", Number(e.target.value))
                }
                className={inputClass}
              />
            </label>

            <label className="text-sm text-slate-200">
              % Subafiliado
              <input
                type="number"
                value={row.subaffiliatePercent}
                onChange={(e) =>
                  updateRow(
                    row.id,
                    "subaffiliatePercent",
                    Number(e.target.value)
                  )
                }
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
            {result?.id === row.id &&
              savingId !== row.id &&
              (result.ok ? (
                <span className="text-emerald-400 text-sm">Guardado ✓</span>
              ) : (
                <span className="text-red-400 text-sm">Error al guardar</span>
              ))}
          </div>

          {(row.walletErc20 || row.walletTrc20) && (
            <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
              <p className="text-xs font-medium text-slate-400">
                Datos de cobro (USDT)
              </p>
              {row.walletErc20 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 shrink-0 w-14">ERC-20</span>
                  <span className="text-xs text-white break-all flex-1 min-w-0">
                    {row.walletErc20}
                  </span>
                  <button
                    onClick={() => copiar(row.walletErc20, row.id + "e")}
                    className="shrink-0 text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    {copied === row.id + "e" ? "Copiado" : "Copiar"}
                  </button>
                </div>
              )}
              {row.walletTrc20 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 shrink-0 w-14">TRC-20</span>
                  <span className="text-xs text-white break-all flex-1 min-w-0">
                    {row.walletTrc20}
                  </span>
                  <button
                    onClick={() => copiar(row.walletTrc20, row.id + "t")}
                    className="shrink-0 text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    {copied === row.id + "t" ? "Copiado" : "Copiar"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
