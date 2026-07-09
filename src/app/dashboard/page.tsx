"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";

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
  { key: "commission", label: "Commission", color: "#2563eb" },
  { key: "clicks", label: "Clicks", color: "#9333ea" },
  { key: "registrations", label: "Registrations", color: "#f59e0b" },
  { key: "ftd", label: "FTD", color: "#1e293b" },
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
}export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dailyData, setDailyData] = useState<DailyPoint[]>(last7Days());
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(new Set(["commission"]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
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

      if (daily && daily.length > 0) {
        setDailyData(
          daily.map((d) => ({
            date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
            commission: d.commission,
            clicks: d.clicks,
            registrations: d.registrations,
            ftd: d.ftd,
          }))
        );
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
    return <p className="text-gray-500">Cargando...</p>;
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

  const conversionRate = totals.registrations > 0 ? ((totals.ftd / totals.registrations) * 100).toFixed(2) : "0.00";
  const balance = stats?.balance ?? 0;

  const statCards = [
    { key: "commission", label: "Commission", value: `€${totals.commission}`, color: "#2563eb" },
    { key: "clicks", label: "Clicks", value: totals.clicks, color: "#9333ea" },
    { key: "registrations", label: "Registrations", value: totals.registrations, color: "#f59e0b" },
    { key: "ftd", label: "FTD", value: totals.ftd, color: "#1e293b" },
    { key: "conversion", label: "Conversion Rate", value: `${conversionRate}%`, color: "#92400e" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <button className="flex items-center gap-2 border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Contact Affiliate Manager
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 max-w-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-500">My balance</span>
          <button className="border border-gray-300 rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-gray-50">
            Request payment
          </button>
        </div>
        <p className="text-3xl font-bold text-gray-900 mb-2">€{balance}</p>
        <p className="text-sm text-gray-500">
          Total amount earned from all referrals so far, excluding commissions already paid out
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map((card) => {
          const isToggleable = card.key !== "conversion";
          const isActive = activeMetrics.has(card.key);
          return (
            <button
              key={card.key}
              onClick={() => isToggleable && toggleMetric(card.key)}
              className={`text-left bg-white border rounded-xl p-4 border-t-4 transition-opacity ${
                isToggleable ? "cursor-pointer" : "cursor-default"
              } ${isToggleable && !isActive ? "opacity-50" : "opacity-100"}`}
              style={{ borderTopColor: card.color }}
            >
              <p className="text-sm text-gray-500 mb-1">{card.label}</p>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            {metricConfig.map((m) => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={2}
                dot={{ r: 3 }}
                hide={!activeMetrics.has(m.key)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}