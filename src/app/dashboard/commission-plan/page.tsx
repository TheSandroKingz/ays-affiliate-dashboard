"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CardsSkeleton } from "@/components/Skeletons";
import LoadError from "@/components/LoadError";
import { Check, Copy } from "lucide-react";
import { esCuentaPropia } from "@/lib/adminId";

export default function CommissionPlanPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [esPropia, setEsPropia] = useState(false);
  const [cpaSpain, setCpaSpain] = useState(85);
  const [cpaOther, setCpaOther] = useState(85);
  const [subaffiliatePercent, setSubaffiliatePercent] = useState(5);
  const [promoLink, setPromoLink] = useState<string | null>(null);
  const [promoLinkCopied, setPromoLinkCopied] = useState(false);
  const [conversion, setConversion] = useState<{ clicks: number; ftd: number; pct: number | null } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setError(true);
        return;
      }
      setEsPropia(esCuentaPropia(user.id));

      const { data, error: qErr } = await supabase
        .from("affiliates")
        .select("cpa_spain, cpa_other, subaffiliate_percent, promo_link, freshaffs_tracking_code")
        .eq("user_id", user.id)
        .maybeSingle();

      // Si no pudimos leer tu plan real, NO mostramos valores por defecto
      // (podrían no ser los tuyos): mejor avisar y ofrecer reintentar.
      if (qErr || !data) {
        setError(true);
        return;
      }

      setCpaSpain(data.cpa_spain ?? 85);
      setCpaOther(data.cpa_other ?? 85);
      setSubaffiliatePercent(data.subaffiliate_percent ?? 5);

      // Calidad de tráfico (depósito medio): en paralelo, sin bloquear.
      fetch("/api/account/calidad", {
        headers: { Authorization: "Bearer " + session.access_token },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => setConversion(b?.conversion ?? null))
        .catch(() => {});
      setPromoLink(
        data.freshaffs_tracking_code
          ? `${window.location.origin}/go/${encodeURIComponent(
              data.freshaffs_tracking_code
            )}`
          : data.promo_link ?? null
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <CardsSkeleton title="Plan de Comisión" cards={3} />;
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <h1 className="text-2xl font-semibold text-white">Plan de Comisión</h1>
        <LoadError onRetry={loadData} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-white">Plan de Comisión</h1>

      {/* Tu enlace, lo primero y bien visible: es la herramienta para ganar. */}
      {promoLink && (
        <div className="rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-1">🔗 Tu enlace para ganar</h2>
          <p className="text-sm text-slate-300 mb-4">
            Compártelo con tu gente. Cuando alguien se registre y haga su primer
            depósito por aquí, ganas tu CPA.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={promoLink}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-lg bg-black/30 border border-white/20 text-white text-sm px-3 py-2.5 truncate"
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(promoLink);
                  setPromoLinkCopied(true);
                  setTimeout(() => setPromoLinkCopied(false), 1500);
                } catch {}
              }}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
                promoLinkCopied
                  ? "bg-emerald-500/20 border border-emerald-400/50 text-emerald-200"
                  : "bg-emerald-500 hover:bg-emerald-400 text-black"
              }`}
            >
              {promoLinkCopied ? (
                <>
                  <Check size={16} className="animate-celebra" /> ¡Copiado!
                </>
              ) : (
                <>
                  <Copy size={16} /> Copiar
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {!esPropia && (
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
<h2 className="text-lg font-semibold text-white mb-4">Subafiliados</h2>
<div className="flex items-center justify-between">
<p className="text-slate-200">Comisión por cada subafiliado</p>
<p className="text-white font-semibold">{subaffiliatePercent}%</p>
</div>
</div>
      )}

<div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
<h2 className="text-lg font-semibold text-white mb-4">CPA</h2>
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
          <p className="text-slate-200">🇪🇸 España (ES)</p>
          <p className="text-white font-semibold">
            €{cpaSpain.toLocaleString("de-DE")}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-slate-200">Otros Países</p>
          <p className="text-white font-semibold">
            €{cpaOther.toLocaleString("de-DE")}
          </p>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Campaña Activa</h2>
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
          <p className="text-slate-200">Marca</p>
          <p className="text-white font-semibold">Celsius</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-slate-200">Depósito mínimo</p>
          <p className="text-white font-semibold">€20</p>
        </div>
      </div>

      {/* Conversión: FTD que sacas de tus clics (su propio recuadro). */}
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Conversión</h2>
        <div className="flex items-center justify-between">
          <p className="text-slate-200">FTD por clics</p>
          {conversion && conversion.pct !== null ? (
            <p className="text-white font-semibold">
              {conversion.pct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}%{" "}
              <span className="text-xs text-slate-400 font-normal">
                · {conversion.ftd} FTD de {conversion.clicks.toLocaleString("de-DE")} clics
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Aún sin datos</p>
          )}
        </div>
      </div>
    </div>
  );
}