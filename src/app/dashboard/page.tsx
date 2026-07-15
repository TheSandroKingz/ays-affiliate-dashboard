"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import ContactManagerButton from "@/components/ContactManagerButton";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import { metricConfig } from "@/lib/metrics";
import { Info } from "lucide-react";

// El gráfico (Recharts) es pesado; lo cargamos en diferido para que el resto
// del panel aparezca antes. Reserva la altura para evitar saltos de layout.
const BalanceChart = dynamic(() => import("@/components/BalanceChart"), {
  ssr: false,
  loading: () => <div className="h-[320px]" />,
});

type Stats = {
  balance: number;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

type DailyPoint = {
  date: string;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

function last7Days(): DailyPoint[] {
  const days: DailyPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
      commission: 0,
      clicks: 0,
      registrations: 0,
      ftd: 0,
    });
  }
  return days;
}

function fillMissingDays(
  daily: { date: string; commission: number; clicks: number; registrations: number; ftd: number }[]
): DailyPoint[] {
  const map = new Map(daily.map((d) => [String(d.date).slice(0, 10), d]));
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const start = new Date(Date.UTC(ty, tm - 1, 1));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  const points: DailyPoint[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key);
    points.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }),
      commission: row ? Number(row.commission) : 0,
      clicks: row ? row.clicks : 0,
      registrations: row ? row.registrations : 0,
      ftd: row ? row.ftd : 0,
    });
  }
  return points;
}

export default function DashboardPage() {
  const [showBalanceInfo, setShowBalanceInfo] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dailyData, setDailyData] = useState<DailyPoint[]>(last7Days());
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(new Set(["commission"]));
  const [loading, setLoading] = useState(true);
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [subCommission, setSubCommission] = useState(0);

  const loadStats = useCallback(async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user || !session) {
        setLoading(false);
        return;
      }

      // Las consultas son independientes entre sí: las lanzamos en paralelo
      // en lugar de una detrás de otra para que el panel cargue antes.
      // La última obtiene la comisión que este afiliado gana por sus
      // subafiliados (calculada en el servidor con permisos elevados).
      const [affiliateRes, statsRes, dailyRes, subRes] =
        await Promise.all([
          supabase
            .from("affiliates")
            .select("id, display_name")
            .eq("user_id", user.id)
            .single(),
          supabase
            .from("affiliate_stats")
            .select("balance, commission, clicks, registrations, ftd")
            .eq("user_id", user.id)
            .single(),
          supabase
            .from("affiliate_daily_stats")
            .select("date, commission, clicks, registrations, ftd")
            .eq("user_id", user.id)
            .order("date", { ascending: true }),
          fetch("/api/subaffiliates", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + session.access_token,
            },
            body: JSON.stringify({ userId: user.id }),
          })
            .then((r) => (r.ok ? r.json() : { rows: [] }))
            .catch(() => ({ rows: [] })),
        ]);

      const affiliateRow = affiliateRes.data;
      if (affiliateRow) {
        setAffiliateId(affiliateRow.id);
        setDisplayName(affiliateRow.display_name ?? null);
      }

      if (!statsRes.error && statsRes.data) {
        setStats(statsRes.data);
      }

      setDailyData(fillMissingDays(dailyRes.data ?? []));

      const subRows: { commission: number }[] = subRes?.rows ?? [];
      const subTotal = subRows.reduce(
        (sum, r) => sum + Number(r.commission ?? 0),
        0
      );
      setSubCommission(subTotal);

      setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return <DashboardSkeleton />;
  }
const totals = dailyData.reduce(
    (acc, d) => ({
      commission: acc.commission + d.commission,
      clicks: acc.clicks + d.clicks,
      registrations: acc.registrations + d.registrations,
      ftd: acc.ftd + d.ftd,
    }),
    { commission: 0, clicks: 0, registrations: 0, ftd: 0 }
  );

  // Total ganado este mes = comisión propia del mes + comisión por sus
  // subafiliados del mes. Se reinicia solo el día 1 (los pagos van aparte,
  // al historial de pagos).
  const balance = totals.commission + subCommission;
  const chartData = dailyData.map((d) => {
    const point: Record<string, number | string> = { date: d.date };
    metricConfig.forEach((m) => {
      point[m.key] = d[m.key];
    });
    return point;
  });


  const primaryMetricKey =
    activeMetrics.size > 0 ? Array.from(activeMetrics)[0] : "commission";
  const statCards = [
    { key: "commission", label: "Comisión", value: `€${totals.commission.toLocaleString("de-DE")}`, color: "#10b981" },
    { key: "clicks", label: "Clics", value: totals.clicks.toLocaleString("de-DE"), color: "#9333ea" },
    { key: "registrations", label: "Registros", value: totals.registrations.toLocaleString("de-DE"), color: "#f59e0b" },
    { key: "ftd", label: "FTD", value: totals.ftd.toLocaleString("de-DE"), color: "#38bdf8" },
  ];

  return (
    <div className="flex flex-col gap-6 pt-4 md:pt-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
            <h1 className="text-2xl font-semibold text-white">Hola{displayName && <>, <span className="text-emerald-400">{displayName}</span></>}</h1>
              <p className="text-sm text-slate-400">{new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
          <div className="flex items-center gap-3">
          <ContactManagerButton />
          <button
            onClick={() => loadStats()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur border border-emerald-400/50 rounded-xl p-6 max-w-md mb-3 shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-300">Mi balance</span>
          <div className="group relative">
            <button
              type="button"
              onClick={() => setShowBalanceInfo((v) => !v)}
              className="flex items-center text-slate-400 hover:text-slate-300"
            >
              <Info size={15} className="cursor-help" />
            </button>
            <div
              className={`pointer-events-none absolute left-0 top-6 z-10 w-60 rounded-lg border border-white/20 bg-black/90 backdrop-blur p-3 shadow-xl transition-opacity group-hover:opacity-100 ${
                showBalanceInfo ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-300">Comisión propia</span>
                <span className="font-medium text-white">€{totals.commission.toLocaleString("de-DE")}</span>
              </div>
              {subCommission > 0 && (
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-slate-300">Por subafiliados</span>
                  <span className="font-medium text-white">€{subCommission.toLocaleString("de-DE")}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-1 text-sm border-t border-white/10 mt-1 pt-2">
                <span className="text-slate-300">Total del mes</span>
                <span className="font-medium text-white">€{balance.toLocaleString("de-DE")}</span>
              </div>
            </div>
          </div>
        </div>
        </div>
        <p className="text-3xl font-bold text-white mb-2">€{balance.toLocaleString("de-DE")}</p>
        <p className="text-sm text-slate-300">
          Total ganado este mes (comisiones propias y de subafiliados). Se reinicia automáticamente el día 1.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((card) => {
          const isActive = activeMetrics.has(card.key);
          return (
            <button
              key={card.key}
              onClick={() => toggleMetric(card.key)}
              className={`text-left p-4 rounded-xl border border-white/10 bg-black/40 hover:bg-black/60 border-t-4 transition-opacity cursor-pointer ${
              !isActive ? "opacity-50" : "opacity-100"
            }`}
              style={{ borderTopColor: card.color }}
            >
              <p className="text-sm text-slate-300 mb-1">{card.label}</p>
              <p className="text-xl font-bold text-white">{card.value}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
        <BalanceChart
          data={chartData}
          activeMetrics={activeMetrics}
          primaryMetricKey={primaryMetricKey}
        />
      </div>
    </div>
  );
}