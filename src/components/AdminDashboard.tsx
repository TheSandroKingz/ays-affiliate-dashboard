"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import { Info } from "lucide-react";

const BalanceChart = dynamic(() => import("@/components/BalanceChart"), {
  ssr: false,
  loading: () => <div className="h-[320px]" />,
});

type Totals = {
  ownEarnings: number;
  structureMargin: number;
  structurePaid: number;
  totalClean: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

const emptyTotals: Totals = {
  ownEarnings: 0,
  structureMargin: 0,
  structurePaid: 0,
  totalClean: 0,
  clicks: 0,
  registrations: 0,
  ftd: 0,
};

function saludo(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 14) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

export default function AdminDashboard() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [daily, setDaily] = useState<{ date: string; earnings: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const [affRes, stRes] = await Promise.all([
      supabase.from("affiliates").select("display_name").eq("user_id", session.user.id).single(),
      fetch("/api/admin/stats", {
        headers: { Authorization: "Bearer " + session.access_token },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    setDisplayName(affRes.data?.display_name ?? null);
    if (stRes?.totals) setTotals(stRes.totals);
    setDaily(stRes?.daily ?? []);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;

  const chartData = daily.map((d) => ({
    date: new Date(d.date + "T00:00:00Z").toLocaleDateString("es-ES", {
      month: "short",
      day: "2-digit",
      timeZone: "UTC",
    }),
    commission: d.earnings,
  }));

  const sinActividad =
    totals.totalClean === 0 && totals.clicks === 0 && totals.ftd === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {saludo()}
            {displayName && (
              <>
                , <span className="text-emerald-400">{displayName}</span>
              </>
            )}
          </h1>
          <p className="text-sm text-slate-400">
            {new Date().toLocaleDateString("es-ES", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {lastUpdated && (
              <span className="text-slate-500">
                {" "}
                · Actualizado{" "}
                {lastUpdated.toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {/* Lo que me llevo limpio */}
      <div
        className="animate-in bg-white/10 backdrop-blur border border-emerald-400/50 rounded-xl p-7 max-w-lg shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-sm font-medium text-slate-300">Mi balance</span>
          <div className="group relative">
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Ver desglose"
              className="flex items-center text-slate-400 hover:text-slate-300"
            >
              <Info size={15} className="cursor-help" />
            </button>
            <div
              className={`pointer-events-none absolute left-0 top-6 z-10 w-64 rounded-lg border border-white/20 bg-black/95 backdrop-blur p-3 shadow-xl transition-opacity group-hover:opacity-100 ${
                showInfo ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-300">Mi link propio</span>
                <span className="font-medium text-white">{eur(totals.ownEarnings)}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-300">Mi estructura</span>
                <span className="font-medium text-white">{eur(totals.structureMargin)}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm border-t border-white/10 mt-1 pt-2">
                <span className="text-slate-300">Mi balance</span>
                <span className="font-semibold text-emerald-400">{eur(totals.totalClean)}</span>
              </div>
            </div>
          </div>
        </div>
        <p className="text-4xl font-bold text-white">{eur(totals.totalClean)}</p>
      </div>

      {/* Lo que hacen mis afiliados */}
      <div className="animate-in grid grid-cols-2 md:grid-cols-4 gap-3" style={{ animationDelay: "0.12s" }}>
        {[
          { label: "Comisión", value: eur(totals.structurePaid), color: "#10b981" },
          { label: "Clics", value: totals.clicks.toLocaleString("de-DE"), color: "#9333ea" },
          { label: "Registros", value: totals.registrations.toLocaleString("de-DE"), color: "#f59e0b" },
          { label: "FTD", value: totals.ftd.toLocaleString("de-DE"), color: "#38bdf8" },
        ].map((c) => (
          <div
            key={c.label}
            className="p-4 rounded-xl border border-white/15 border-t-4 bg-black/40"
            style={{ borderTopColor: c.color }}
          >
            <p className="text-sm text-slate-300 mb-1">{c.label}</p>
            <p className="text-xl font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Gráfico de lo que me llevo */}
      <div className="animate-in relative bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3 sm:p-6" style={{ animationDelay: "0.18s" }}>
        <BalanceChart
          data={chartData.length ? chartData : [{ date: "", commission: 0 }]}
          activeMetrics={new Set(["commission"])}
          primaryMetricKey="commission"
        />
        {sinActividad && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-slate-400 bg-black/50 border border-white/10 px-3 py-1.5 rounded-lg">
              Aún no hay actividad
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
