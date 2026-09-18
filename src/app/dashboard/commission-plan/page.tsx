"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CardsSkeleton } from "@/components/Skeletons";
import LoadError from "@/components/LoadError";
import { esCuentaPropia } from "@/lib/adminId";

export default function CommissionPlanPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [esPropia, setEsPropia] = useState(false);
  const [cpaSpain, setCpaSpain] = useState(85);
  const [cpaOther, setCpaOther] = useState(85);
  const [subaffiliatePercent, setSubaffiliatePercent] = useState(5);

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

      {/* ⛔ SIN CASINO (18-sep-2026): Celsius corto el trafico y los enlaces ya no
          funcionan, asi que NO se les enseña el suyo: no tiene sentido que sigan
          repartiendo un enlace roto ni invirtiendo en publicidad. Cuando haya
          casino nuevo, se quita este aviso y vuelve el bloque del enlace. */}
      <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-1">⏸️ Los enlaces están parados</h2>
        <p className="text-sm text-amber-100/90">
          Ahora mismo no hay ningún sitio al que mandar gente, así que tu enlace no
          está disponible. No gastes en publicidad de momento.
        </p>
        <p className="text-sm text-slate-300 mt-2">
          En cuanto haya algo nuevo se avisa por el canal <b className="text-white">KiNGZ Cheles</b> y
          aquí te aparecerá tu enlace otra vez. Lo que ya has ganado sigue en tu panel y se te paga igual.
        </p>
      </div>

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

    </div>
  );
}