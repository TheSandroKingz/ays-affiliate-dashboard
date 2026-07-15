"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import ContactManagerButton from "@/components/ContactManagerButton";
import { Info } from "lucide-react";

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

const metricConfig = [
  { key: "commission", label: "Comisión", color: "#10b981" },
{ key: "clicks", label: "Clics", color: "#9333ea" },
{ key: "registrations", label: "Registros", color: "#f59e0b" },
  { key: "ftd", label: "FTD", color: "#38bdf8" },
] as const;

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
  const [totalPaid, setTotalPaid] = useState(0);
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }
      const { data: affiliateRow } = await supabase
      .from("affiliates")
      .select("id, display_name")
      .eq("user_id", user.id)
      .single();

    if (affiliateRow) {
      setAffiliateId(affiliateRow.id);
        setDisplayName(affiliateRow.display_name ?? null);
    }

      const { data, error } = await supabase
        .from("affiliate_stats")
        .select("balance, commission, clicks, registrations, ftd")
        .eq("user_id", user.id)
        .single();

      if (!error && data) {
        setStats(data);
      }

      const { data: daily } = await supabase
        .from("affiliate_daily_stats")
        .select("date, commission, clicks, registrations, ftd")
        .eq("user_id", user.id)
        .order("date", { ascending: true });

      setDailyData(fillMissingDays(daily ?? []));
const { data: payments } = await supabase
  .from("payments")
  .select("amount")
  .eq("user_id", user.id);

if (payments) {
  const paidSum = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  setTotalPaid(paidSum);
}
      setLoading(false);
    }

    loadStats();
  }, []);const toggleMetric = (key: string) => {
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
    return <p className="text-slate-300">Cargando...</p>;
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

  const balance = totals.commission - totalPaid;
  const chartData = dailyData.map((d) => {
  const point: Record<string, number | string> = { date: d.date };
  metricConfig.forEach((m) => {
    const max = Math.max(...dailyData.map((p) => p[m.key]), 1);
    point[m.key] = d[m.key];
    point[`${m.key}Pct`] = (d[m.key] / max) * 100;
  });
  return point;
});


  const primaryMetricKey = (activeMetrics.size > 0 ? Array.from(activeMetrics)[0] : "commission") as any;
  const primaryMax = Math.max(...dailyData.map((p: any) => Number(p[primaryMetricKey]) || 0), 1);
  const statCards = [
    { key: "commission", label: "Comisión", value: `€${totals.commission.toLocaleString("de-DE")}`, color: "#10b981" },
    { key: "clicks", label: "Clics", value: totals.clicks.toLocaleString("de-DE"), color: "#9333ea" },
    { key: "registrations", label: "Registros", value: totals.registrations.toLocaleString("de-DE"), color: "#f59e0b" },
    { key: "ftd", label: "FTD", value: totals.ftd.toLocaleString("de-DE"), color: "#94a3b8" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
            <h1 className="text-2xl font-semibold text-white">Hola{displayName && <>, <span className="text-emerald-400">{displayName}</span></>}</h1>
              <p className="text-sm text-slate-400">{new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
          <div className="flex items-center gap-3">
          <ContactManagerButton />
          <button
            onClick={() => window.location.reload()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6 max-w-md">
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
                <span className="text-slate-300">Fondos accesibles</span>
                <span className="font-medium text-white">€{balance.toLocaleString("de-DE")}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-300">Ganado</span>
                <span className="font-medium text-white">€{totals.commission.toLocaleString("de-DE")}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-300">Pagado</span>
                <span className="font-medium text-white">€{totalPaid.toLocaleString("de-DE")}</span>
              </div>
            </div>
          </div>
        </div>
        </div>
        <p className="text-3xl font-bold text-white mb-2">€{balance.toLocaleString("de-DE")}</p>
        <p className="text-sm text-slate-300">
          Monto total ganado de todos los referidos hasta ahora, sin incluir comisiones ya pagadas
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((card) => {
          const isToggleable = card.key !== "conversion";
          const isActive = activeMetrics.has(card.key);
          return (
            <button
              key={card.key}
              onClick={() => isToggleable && toggleMetric(card.key)}
              className={`text-left p-4 rounded-xl border border-white/10 bg-black/40 hover:bg-black/60 border-t-4 transition-opacity${
              isToggleable ? " cursor-pointer" : " cursor-default"
            } ${isToggleable && !isActive ? " opacity-50" : " opacity-100"}`}
              style={{ borderTopColor: card.color }}
            >
              <p className="text-sm text-slate-300 mb-1">{card.label}</p>
              <p className="text-xl font-bold text-white">{card.value}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-6">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <defs>
              {metricConfig.map((m) => (
                <linearGradient key={m.key} id={`chartGradient-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={m.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={m.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" vertical={false} />
            <XAxis dataKey="date" fontSize={13} stroke="#94a3b8" angle={-45} textAnchor="end" height={50} />
            <YAxis
              yAxisId="left"
              domain={[0, (max: number) => (max <= 0 ? 10 : max)]}
              fontSize={13}
              stroke="#94a3b8"
              tickFormatter={(v: number) => (primaryMetricKey === "commission" ? `€${Math.round(v).toLocaleString("de-DE")}` : Math.round(v).toLocaleString("de-DE"))}
              width={70}
              label={{
                value: metricConfig.find((m) => m.key === primaryMetricKey)?.label ?? "",
                angle: -90,
                position: "insideLeft",
                fill: "#94a3b8",
                fontSize: 12,
              }}
            />
          <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, (max: number) => (max <= 0 ? 10 : max)]}
              fontSize={13}
              stroke="#94a3b8"
              tickFormatter={(v: number) => Math.round(v).toLocaleString("de-DE")}
              width={Array.from(activeMetrics).some((k) => k !== primaryMetricKey) ? 60 : 0}
              hide={!Array.from(activeMetrics).some((k) => k !== primaryMetricKey)}
            />
          <Tooltip

            contentStyle={{

              backgroundColor: "#0a0a0a",

              border: "1px solid rgba(255,255,255,0.2)",

              borderRadius: 8,

            }}

            labelStyle={{ color: "#94a3b8" }}

            itemStyle={{ color: "#34d399" }}

            formatter={(value: any, name: any) => {

              const metric = metricConfig.find((m) => m.key === name);

              return [value, metric ? metric.label : name];

            }}

          />
            {(() => {
              const showArea = activeMetrics.size <= 2;
              return metricConfig.map((m) => {
                const isPrimary = m.key === primaryMetricKey;
                const commonProps = {
                  key: m.key,
                  type: "monotone" as const,
                  dataKey: m.key,
                  yAxisId: isPrimary ? "left" : "right",
                  stroke: m.color,
                  strokeWidth: 2,
                  dot: { r: 3, strokeWidth: 2, fill: "#0a0a0a" },
                  hide: !activeMetrics.has(m.key),
                };
                return showArea ? (
                  <Area {...commonProps} fill={`url(#chartGradient-${m.key})`} />
                ) : (
                  <Line {...commonProps} />
                );
              });
            })()}
            </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}