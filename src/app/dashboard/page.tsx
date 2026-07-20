"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import ContactManagerButton from "@/components/ContactManagerButton";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import AdminDashboard from "@/components/AdminDashboard";
import LoadError from "@/components/LoadError";
import { useProfile } from "@/components/DashboardProvider";
import { metricConfig } from "@/lib/metrics";
import { eur } from "@/lib/format";
import { Info, TrendingUp, TrendingDown } from "lucide-react";

// El gráfico (Recharts) es pesado; lo cargamos en diferido para que el resto
// del panel aparezca antes. Reserva la altura para evitar saltos de layout.
const BalanceChart = dynamic(() => import("@/components/BalanceChart"), {
  ssr: false,
  loading: () => <div className="h-[320px]" />,
});

type DailyPoint = {
  date: string;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

function saludo(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 14) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

function last7Days(): DailyPoint[] {
  const days: DailyPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toLocaleDateString("es-ES", { month: "short", day: "2-digit" }),
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
      date: d.toLocaleDateString("es-ES", { month: "short", day: "2-digit", timeZone: "UTC" }),
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
  const [dailyData, setDailyData] = useState<DailyPoint[]>(last7Days());
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(new Set(["commission"]));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { displayName } = useProfile(); // nombre desde el almacén compartido
  const [subCommission, setSubCommission] = useState(0);
  const [totalGenerado, setTotalGenerado] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadStats = useCallback(async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError(false);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user || !session) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Cuenta de admin: tiene su propio panel dedicado (AdminDashboard).
      if (user.id === ADMIN_USER_ID) {
        setIsAdmin(true);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Las consultas son independientes entre sí: las lanzamos en paralelo.
      // El nombre ya lo tiene el almacén compartido, así que aquí solo pedimos
      // los datos diarios y la comisión de subafiliados (una consulta menos).
      const [dailyRes, subRes] = await Promise.all([
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

      // Solo bloqueamos si falla la carga de DATOS (lo que importa).
      if (dailyRes.error) {
        setLoadError(true);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setDailyData(fillMissingDays(dailyRes.data ?? []));

      const subRows: { commission: number }[] = subRes?.rows ?? [];
      const subTotal = subRows.reduce(
        (sum, r) => sum + Number(r.commission ?? 0),
        0
      );
      setSubCommission(subTotal);

      // Total histórico generado (comisión propia + subafiliados de todo el
      // tiempo, aunque ya se haya cobrado).
      const propiaHist = (dailyRes.data ?? []).reduce(
        (sum, d) => sum + Number(d.commission ?? 0),
        0
      );
      setTotalGenerado(propiaHist + Number(subRes?.totalHistorico ?? 0));

      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
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

  // Cálculos memoizados: así no se rehacen (ni se re-renderiza el gráfico)
  // al abrir el tooltip del balance o togglear métricas.
  const totals = useMemo(
    () =>
      dailyData.reduce(
        (acc, d) => ({
          commission: acc.commission + d.commission,
          clicks: acc.clicks + d.clicks,
          registrations: acc.registrations + d.registrations,
          ftd: acc.ftd + d.ftd,
        }),
        { commission: 0, clicks: 0, registrations: 0, ftd: 0 }
      ),
    [dailyData]
  );

  const chartData = useMemo(
    () =>
      dailyData.map((d) => {
        const point: Record<string, number | string> = { date: d.date };
        metricConfig.forEach((m) => {
          point[m.key] = d[m.key];
        });
        return point;
      }),
    [dailyData]
  );

  const statCards = useMemo(
    () => [
      { key: "commission", label: isAdmin ? "Mi margen" : "Comisión", value: eur(totals.commission), color: "#10b981" },
      { key: "clicks", label: "Clics", value: totals.clicks.toLocaleString("de-DE"), color: "#9333ea" },
      { key: "registrations", label: "Registros", value: totals.registrations.toLocaleString("de-DE"), color: "#f59e0b" },
      { key: "ftd", label: "FTD", value: totals.ftd.toLocaleString("de-DE"), color: "#38bdf8" },
    ],
    [totals, isAdmin]
  );

  if (loading) {
    return <DashboardSkeleton />;
  }

  // La cuenta de admin tiene su propio panel dedicado.
  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (loadError) {
    return <LoadError onRetry={() => loadStats()} />;
  }

  // Total ganado este mes = comisión propia + subafiliados del mes.
  const balance = totals.commission + subCommission;
  // Crecimiento: comisión de HOY vs AYER (últimos dos días de la serie, que va
  // del día 1 del mes hasta hoy en orden).
  const hoyC = dailyData.length ? dailyData[dailyData.length - 1].commission : 0;
  const ayerC = dailyData.length > 1 ? dailyData[dailyData.length - 2].commission : 0;
  const deltaHoy = hoyC - ayerC;
  const primaryMetricKey =
    activeMetrics.size > 0 ? Array.from(activeMetrics)[0] : "commission";
  const sinActividad =
    totals.commission === 0 &&
    totals.clicks === 0 &&
    totals.registrations === 0 &&
    totals.ftd === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
            <h1 className="text-2xl font-semibold text-white">{saludo()}{displayName && <>, <span className="text-emerald-400">{displayName}</span></>}</h1>
              <p className="text-sm text-slate-400">
                {new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                {lastUpdated && (
                  <span className="text-slate-500"> · Actualizado {lastUpdated.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}<span className="text-[0.5em] opacity-70">:{String(lastUpdated.getSeconds()).padStart(2, "0")}</span></span>
                )}
              </p>
            </div>
          <div className="flex items-center gap-2 sm:gap-3">
          {!isAdmin && <ContactManagerButton />}
          <button
            onClick={() => loadStats(true)}
            disabled={refreshing}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            {refreshing ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      <div className="animate-in bg-white/10 backdrop-blur border border-emerald-400/50 rounded-xl p-7 max-w-lg shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]" style={{ animationDelay: "0.05s" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="group relative flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-300">{isAdmin ? "Lo que me quedo" : "Mi balance"}</span>
            <button
              type="button"
              onClick={() => setShowBalanceInfo((v) => !v)}
              aria-label="Ver desglose del balance"
              className="flex items-center p-2 -m-2 text-slate-400 hover:text-slate-300"
            >
              <Info size={16} className="cursor-help" />
            </button>
            <div
              className={`pointer-events-none absolute left-0 top-8 z-10 w-64 max-w-[calc(100vw-2.5rem)] rounded-lg border border-white/20 bg-black/95 backdrop-blur p-3 shadow-xl transition-opacity group-hover:opacity-100 ${
                showBalanceInfo ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-300">{isAdmin ? "Mi margen (este mes)" : "Comisión propia"}</span>
                <span className="font-medium text-white">{eur(totals.commission)}</span>
              </div>
              {!isAdmin && subCommission > 0 && (
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-slate-300">Por subafiliados</span>
                  <span className="font-medium text-white">{eur(subCommission)}</span>
                </div>
              )}
              {!isAdmin && (
                <div className="flex items-center justify-between py-1 text-sm border-t border-white/10 mt-1 pt-2">
                  <span className="text-slate-300">Total del mes</span>
                  <span className="font-medium text-white">{eur(balance)}</span>
                </div>
              )}
              {!isAdmin && (
                <div className="flex items-center justify-between py-1 text-sm">
                  <span className="text-slate-300">Total generado</span>
                  <span className="font-semibold text-emerald-400">{eur(totalGenerado)}</span>
                </div>
              )}
            </div>
        </div>
        </div>
        <p className="text-3xl sm:text-4xl font-bold text-white">{eur(balance)}</p>
        {!isAdmin && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-slate-300">
              Hoy <b className="text-white">{eur(hoyC)}</b>
            </span>
            {deltaHoy === 0 ? (
              <span className="text-slate-500">· igual que ayer</span>
            ) : (
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${
                  deltaHoy > 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {deltaHoy > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {eur(Math.abs(deltaHoy))}
                <span className="text-slate-500 font-normal">vs ayer</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="animate-in grid grid-cols-2 md:grid-cols-4 gap-3" style={{ animationDelay: "0.12s" }}>
        {statCards.map((card) => {
          const isActive = activeMetrics.has(card.key);
          return (
            <button
              key={card.key}
              onClick={() => toggleMetric(card.key)}
              className={`text-left p-4 rounded-xl border border-white/10 bg-black/40 hover:bg-black/60 hover:-translate-y-0.5 border-t-4 transition duration-200 cursor-pointer ${
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

      <div className="animate-in relative bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3 sm:p-6" style={{ animationDelay: "0.2s" }}>
        <BalanceChart
          data={chartData}
          activeMetrics={activeMetrics}
          primaryMetricKey={primaryMetricKey}
        />
        {sinActividad && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-slate-400 bg-black/50 border border-white/10 px-3 py-1.5 rounded-lg">
              Aún no hay actividad este mes
            </p>
          </div>
        )}
      </div>
    </div>
  );
}