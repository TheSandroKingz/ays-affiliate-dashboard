"use client";

import { useEffect, useState } from "react";
import { Copy, QrCode } from "lucide-react";
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

const chartData = [
  { day: "Jul 01", commission: 0 },
  { day: "Jul 02", commission: 0 },
  { day: "Jul 03", commission: 0 },
  { day: "Jul 04", commission: 0 },
  { day: "Jul 05", commission: 0 },
  { day: "Jul 06", commission: 0 },
  { day: "Jul 07", commission: 0 },
];

type Stats = {
  balance: number;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

export default function DashboardPage() {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const referralLink = "https://tusitio.com/visit/?bta=44878";
useEffect(() => {
    async function loadStats() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }const { data, error } = await supabase
        .from("affiliate_stats")
        .select("balance, commission, clicks, registrations, ftd")
        .eq("user_id", user.id)
        .single();

      if (!error && data) {
        setStats(data);
      }
      setLoading(false);
    }

    loadStats();
  }, []);const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return <p className="text-gray-500">Cargando...</p>;
  }

  const s = stats ?? { balance: 0, commission: 0, clicks: 0, registrations: 0, ftd: 0 };
  const conversionRate = s.registrations > 0 ? ((s.ftd / s.registrations) * 100).toFixed(2) : "0.00";

  const statCards = [
    { label: "Commission", value: `€${s.commission}` },
    { label: "Clicks", value: s.clicks },
    { label: "Registrations", value: s.registrations },
    { label: "FTD", value: s.ftd },
    { label: "Conversion Rate", value: `${conversionRate}%` },
  ];
return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <button className="flex items-center gap-2 border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Contact Affiliate Manager
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">My balance</span>
            <button className="border border-gray-300 rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-gray-50">
              Request payment
            </button>
          </div>
          <p className="text-3xl font-bold text-gray-900 mb-2">€{s.balance}</p>
          <p className="text-sm text-gray-500">
            Total amount earned from all referrals so far, excluding commissions already paid out
          </p>
        </div>

      </div><div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500 mb-1">{s.label}</p>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="day" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Line type="monotone" dataKey="commission" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}