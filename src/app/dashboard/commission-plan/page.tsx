"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CardsSkeleton } from "@/components/Skeletons";

export default function CommissionPlanPage() {
  const [loading, setLoading] = useState(true);
  const [cpaSpain, setCpaSpain] = useState(85);
  const [cpaOther, setCpaOther] = useState(85);
  const [subaffiliatePercent, setSubaffiliatePercent] = useState(5);
  const [promoLink, setPromoLink] = useState<string | null>(null);
  const [promoLinkCopied, setPromoLinkCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("affiliates")
        .select("cpa_spain, cpa_other, subaffiliate_percent, promo_link, freshaffs_tracking_code")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setCpaSpain(data.cpa_spain ?? 85);
        setCpaOther(data.cpa_other ?? 85);
        setSubaffiliatePercent(data.subaffiliate_percent ?? 5);
        setPromoLink(
          data.freshaffs_tracking_code
            ? `${window.location.origin}/go/${encodeURIComponent(
                data.freshaffs_tracking_code
              )}`
            : data.promo_link ?? null
        );
      }
      setLoading(false);
    }
    loadData();
  }, []);

  if (loading) {
    return <CardsSkeleton title="Plan de Comisión" cards={3} />;
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-white">Plan de Comisión</h1>

      

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
<h2 className="text-lg font-semibold text-white mb-4">Sub Afiliados</h2>
<div className="flex items-center justify-between">
<p className="text-slate-200">Comisión por cada sub afiliado</p>
<p className="text-white font-semibold">{subaffiliatePercent}%</p>
</div>
</div>

<div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
<h2 className="text-lg font-semibold text-white mb-4">CPA</h2>
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
          <p className="text-slate-200">🇪🇸 España (ES)</p>
          <p className="text-white font-semibold">
            {cpaSpain.toLocaleString("de-DE")} €
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-slate-200">Otros Países</p>
          <p className="text-white font-semibold">
            {cpaOther.toLocaleString("de-DE")} €
          </p>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Campaña Activa</h2>
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
          <p className="text-slate-200">Marca</p>
          <p className="text-white font-semibold">FreshBet</p>
        </div>
        {promoLink && (
          <div className="border-b border-white/10 pb-3 mb-3">
            <p className="text-slate-200 mb-2">Tu enlace de FreshBet</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={promoLink}
                className="flex-1 min-w-0 rounded-lg bg-white/10 border border-white/20 text-white text-xs px-3 py-2 truncate"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(promoLink);
                  setPromoLinkCopied(true);
                  setTimeout(() => setPromoLinkCopied(false), 1500);
                }}
                className="shrink-0 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                {promoLinkCopied ? "Copiado" : "Copiar enlace"}
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-slate-200">Depósito mínimo</p>
          <p className="text-white font-semibold">20 €</p>
        </div>
      </div>
    </div>
  );
}