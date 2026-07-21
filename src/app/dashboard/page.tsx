"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import ContactManagerButton from "@/components/ContactManagerButton";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import AdminDashboard from "@/components/AdminDashboard";
import LoadError from "@/components/LoadError";
import Confetti from "@/components/Confetti";
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

// Emoji del saludo según la hora (detalle cálido).
function saludoEmoji(): string {
  const h = new Date().getHours();
  if (h < 6) return "🌙";
  if (h < 14) return "☀️";
  if (h < 21) return "🌤️";
  return "🌙";
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
  const [ranking, setRanking] = useState<{ puesto: number; total: number } | null>(null);
  // Histórico crudo (todas las fechas) para meta, mejores días y aviso del día 1.
  const [rawDaily, setRawDaily] = useState<DailyPoint[]>([]);
  const [welcomeCerrado, setWelcomeCerrado] = useState(true);
  const [celebrar, setCelebrar] = useState(false);
  const prevFtdRef = useRef<number | null>(null);

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
      setRawDaily((dailyRes.data ?? []) as DailyPoint[]);

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

      // Puesto en el ranking (en paralelo, sin bloquear el panel).
      fetch("/api/account/ranking", {
        headers: { Authorization: "Bearer " + session.access_token },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) =>
          setRanking(
            b && typeof b.puesto === "number"
              ? { puesto: b.puesto, total: b.total }
              : null
          )
        )
        .catch(() => {});

      setLastUpdated(new Date());
      setLoading(false);
      setRefreshing(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Bienvenida solo la primera vez (hasta que la cierre).
  useEffect(() => {
    setWelcomeCerrado(localStorage.getItem("welcomeCerrado") === "1");
  }, []);
  const cerrarWelcome = () => {
    localStorage.setItem("welcomeCerrado", "1");
    setWelcomeCerrado(true);
  };

  // Celebración: si al actualizar hay MÁS FTD que antes, ¡nuevo FTD!
  const ftdActual = useMemo(
    () => rawDaily.reduce((s, r) => {
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
      return String(r.date).slice(0, 7) === hoy.slice(0, 7) ? s + Number(r.ftd ?? 0) : s;
    }, 0),
    [rawDaily]
  );
  useEffect(() => {
    const prev = prevFtdRef.current;
    prevFtdRef.current = ftdActual;
    if (prev !== null && ftdActual > prev) {
      setCelebrar(true);
      const t = setTimeout(() => setCelebrar(false), 4500);
      return () => clearTimeout(t);
    }
  }, [ftdActual]);

  // Registra la visita del afiliado (para que el admin vea quién entra). Máximo
  // una cada 30 min para no inflar con recargas. El admin no cuenta.
  useEffect(() => {
    async function ping() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || session.user.id === ADMIN_USER_ID) return;
      const last = Number(localStorage.getItem("visitPing") || 0);
      if (Date.now() - last < 30 * 60 * 1000) return;
      localStorage.setItem("visitPing", String(Date.now()));
      fetch("/api/account/visita", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token },
      }).catch(() => {});
    }
    ping();
  }, []);

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

  // Mes anterior (para la meta "superar el mes pasado" y el aviso del día 1).
  const mesAnterior = useMemo(() => {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
    const [y, m] = hoy.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1)); // mes anterior
    const key = prev.toISOString().slice(0, 7);
    let commission = 0, ftd = 0;
    for (const r of rawDaily) {
      if (String(r.date).slice(0, 7) === key) {
        commission += Number(r.commission ?? 0);
        ftd += Number(r.ftd ?? 0);
      }
    }
    return { commission, ftd };
  }, [rawDaily]);

  // Racha: días seguidos con FTD (cuenta hacia atrás desde hoy; si hoy aún no
  // hay, sigue viva contando desde ayer). Solo se muestra si es de 2 o más.
  const racha = useMemo(() => {
    const conFtd = new Set(
      rawDaily.filter((r) => Number(r.ftd ?? 0) > 0).map((r) => String(r.date).slice(0, 10))
    );
    if (conFtd.size === 0) return 0;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
    const d = new Date(hoy + "T00:00:00Z");
    if (!conFtd.has(hoy)) d.setUTCDate(d.getUTCDate() - 1);
    let count = 0;
    while (conFtd.has(d.toISOString().slice(0, 10))) {
      count++;
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return count;
  }, [rawDaily]);

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

  // Proyección de fin de mes: al ritmo actual, cuánto cerrará el mes.
  const hoyISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const [yProj, mProj, dProj] = hoyISO.split("-").map(Number);
  const diasMes = new Date(yProj, mProj, 0).getDate();
  // El ritmo se cuenta desde el PRIMER FTD (no desde el día 1): el afiliado no
  // empieza el día 1. dailyData va del día 1 al de hoy (una entrada por día).
  const primerFtdIdx = dailyData.findIndex((d) => d.ftd > 0);
  const diasTrabajados = primerFtdIdx >= 0 ? dProj - primerFtdIdx : 0;
  const ritmoDia = diasTrabajados > 0 ? balance / diasTrabajados : 0;
  const diasRestantes = diasMes - dProj;
  const proyeccionRaw = balance + ritmoDia * diasRestantes;
  // Es una estimación: la redondeamos a múltiplo de 10 para que salga limpia.
  const proyeccion = Math.round(proyeccionRaw / 10) * 10;
  const mostrarProyeccion =
    !isAdmin && balance > 0 && diasTrabajados > 0 && dProj < diasMes && proyeccion > 0;
  const primaryMetricKey =
    activeMetrics.size > 0 ? Array.from(activeMetrics)[0] : "commission";
  const sinActividad =
    totals.commission === 0 &&
    totals.clicks === 0 &&
    totals.registrations === 0 &&
    totals.ftd === 0;

  // Aviso primeros días de mes: el balance se reinició; lo anterior se paga aparte.
  const diaDelMes = Number(hoyISO.slice(8, 10));
  const mostrarAvisoMes = !isAdmin && diaDelMes <= 5 && mesAnterior.commission > 0;
  const diasRestantesMes = Math.max(0, diasMes - diaDelMes);

  return (
    <div className="flex flex-col gap-6">
      {celebrar && (
        <>
          <Confetti />
          <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
            <div className="animate-celebra bg-emerald-600 text-white font-semibold px-5 py-3 rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.7)] flex items-center gap-2">
              <span className="text-xl">🎉</span> ¡Nuevo FTD!
            </div>
          </div>
        </>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
            <h1 className="text-2xl font-semibold text-white">{saludo()}{displayName && <>, <span className="text-emerald-400">{displayName}</span></>} {saludoEmoji()}</h1>
              <p className="text-sm text-slate-400">
                {new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                {lastUpdated && (
                  <span className="text-slate-500"> · <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 align-middle animate-latido" /> Actualizado {lastUpdated.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}<span className="text-[0.5em] opacity-70">:{String(lastUpdated.getSeconds()).padStart(2, "0")}</span></span>
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

      {/* Bienvenida (solo la primera vez). Explica lo básico sin agobiar. */}
      {!isAdmin && !welcomeCerrado && (
        <div className="animate-in relative bg-emerald-500/10 border border-emerald-400/40 rounded-xl p-5 pr-10">
          <button
            onClick={cerrarWelcome}
            aria-label="Cerrar"
            className="absolute top-3 right-3 text-slate-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
          <p className="text-white font-semibold mb-1">¡Bienvenido/a{displayName ? `, ${displayName}` : ""}! 👋</p>
          <p className="text-sm text-slate-300 leading-relaxed">
            Comparte tu enlace y ganas por cada jugador que se registre y haga su
            primer depósito. Encuentra tu enlace en{" "}
            <b className="text-emerald-300">Plan de comisiones</b>. Aquí verás tus
            clics, registros, FTD y lo que llevas ganado este mes.
          </p>
        </div>
      )}

      {/* Aviso de cambio de mes: el balance se reinicia, lo anterior se paga aparte. */}
      {mostrarAvisoMes && (
        <div className="animate-in flex items-start gap-3 bg-white/5 border border-white/15 rounded-xl px-4 py-3">
          <span className="text-lg leading-none">📅</span>
          <p className="text-sm text-slate-300">
            Nuevo mes: tu balance se ha reiniciado a 0. Lo que ganaste el mes
            pasado (<b className="text-white">{eur(mesAnterior.commission)}</b>) se
            te paga aparte, no lo pierdes.
          </p>
        </div>
      )}

      {!isAdmin && ranking && ranking.total >= 2 && (
        <div className="animate-in inline-flex items-center gap-1.5 self-start rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs">
          <span aria-hidden className="text-sm">🏆</span>
          <span className="text-amber-100">
            Vas <b className="text-white">#{ranking.puesto}</b> este mes
          </span>
        </div>
      )}

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
        {mostrarProyeccion && (
          <p className="mt-1 text-[11px] text-slate-500">
            A este ritmo cerrarás el mes en{" "}
            <span className="text-slate-300 font-medium">{eur(proyeccion)}</span>{" "}
            aproximadamente
          </p>
        )}
      </div>

      {/* Racha de FTD y días que quedan de mes (detalles motivadores). */}
      {!isAdmin && (racha >= 2 || diasRestantesMes > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 -mt-2">
          {racha >= 2 && (
            <span>🔥 <b className="text-slate-200">{racha} días</b> seguidos con FTD</span>
          )}
          {diasRestantesMes > 0 && (
            <span>🗓️ Quedan <b className="text-slate-200">{diasRestantesMes} días</b> de mes</span>
          )}
        </div>
      )}

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