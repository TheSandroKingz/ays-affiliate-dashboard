"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function CommissionPlanPage() {
  const [loading, setLoading] = useState(true);
  const [cpaSpain, setCpaSpain] = useState(85);
  const [cpaOther, setCpaOther] = useState(85);
  const [subaffiliatePercent, setSubaffiliatePercent] = useState(9);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("affiliates")
        .select("cpa_spain, cpa_other, subaffiliate_percent")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setCpaSpain(data.cpa_spain ?? 85);
        setCpaOther(data.cpa_other ?? 85);
        setSubaffiliatePercent(data.subaffiliate_percent ?? 9);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  if (loading) {
    return <p className="text-slate-300">Cargando...</p>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-white">Plan de Comisión</h1>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Campaña Activa</h2>
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
          <p className="text-slate-200">Marca</p>
          <p className="text-white font-semibold">FreshBet</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-slate-200">Depósito mínimo</p>
          <p className="text-white font-semibold">20 €</p>
        </div>
      </div>

      

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
<h2 className="text-lg font-semibold text-white mb-4">Sub Afiliados</h2>
<div className="flex items-center justify-between">
<p className="text-slate-200">Comisión por cada sub afiliado</p>
<p className="text-white font-semibold">5%</p>
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
    </div>
  );
}