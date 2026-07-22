"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/format";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import LoadError from "@/components/LoadError";
import { useProfile } from "@/components/DashboardProvider";
import { metricConfig } from "@/lib/metrics";
import { Info, UserPlus, TrendingUp, TrendingDown, ShieldAlert } from "lucide-react";
import Confetti from "@/components/Confetti";
import { reproducirSonido } from "@/lib/sonido";

type DailyRow = {
  date: string;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
  earnings: number;
};

const BalanceChart = dynamic(() => import("@/components/BalanceChart"), {
  ssr: false,
  loading: () => <div className="h-[320px]" />,
});

type Totals = {
  ownEarnings: number;
  structureMargin: number;
  structureMarginNet: number;
  structurePaid: number;
  totalClean: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

const emptyTotals: Totals = {
  ownEarnings: 0,
  structureMargin: 0,
  structureMarginNet: 0,
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
  const { displayName } = useProfile(); // nombre desde el almacén compartido
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<Set<string>>(
    () => new Set(["commission"])
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [seguridad, setSeguridad] = useState<{
    retenidos: number;
    dobles: number;
    ok: boolean;
  } | null>(null);
  const [freshbet, setFreshbet] = useState<{
    diasSin: number;
    clics7: number;
    alerta: boolean;
  } | null>(null);
  const [lastMonthToDate, setLastMonthToDate] = useState<number | null>(null);
  const [paises, setPaises] = useState<{ code: string; n: number }[]>([]);
  const [celebrar, setCelebrar] = useState(false);
  const [hito, setHito] = useState<number | null>(null);
  const prevFtdRef = useRef<number | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      // Una sola llamada: mes en curso + mes pasado + histórico + pendientes.
      const res = await fetch("/api/admin/overview", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + session.access_token },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      // Si la carga de datos falló, mostramos error (no 0€ falsos).
      if (!res || !res.month?.totals) {
        setLoadError(true);
      } else {
        // Celebración: si al actualizar hay MÁS FTD que antes, ¡nuevo FTD!
        const esPrimeraCarga = prevFtdRef.current === null;
        const nuevoFtd = Number(res.month.totals.ftd ?? 0);
        if (prevFtdRef.current !== null && nuevoFtd > prevFtdRef.current) {
          setCelebrar(true);
          reproducirSonido();
          setTimeout(() => setCelebrar(false), 4500);
        }
        prevFtdRef.current = nuevoFtd;
        setTotals(res.month.totals);
        setDaily(res.month.daily ?? []);
        setPendientes(Number(res.pending ?? 0));
        setSeguridad(res.seguridad ?? null);
        setFreshbet(res.freshbet ?? null);
        setLastMonthToDate(
          typeof res.lastMonthToDateClean === "number" ? res.lastMonthToDateClean : null
        );
        setPaises(Array.isArray(res.paises) ? res.paises : []);

        // Hitos de beneficio: confeti al pasar 100/250/500/1000... por primera
        // vez este mes (recordado en localStorage para no repetir).
        const limpio = Number(res.month.totals.totalClean ?? 0);
        const hitos = [100, 250, 500, 1000, 2000, 3000, 5000, 10000];
        const mesKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" })
          .format(new Date())
          .slice(0, 7);
        const yaKey = "hitoBeneficio:" + mesKey;
        const yaCelebrado = Number(localStorage.getItem(yaKey) || 0);
        const alcanzado = [...hitos].reverse().find((h) => limpio >= h) ?? 0;
        if (alcanzado > yaCelebrado) {
          localStorage.setItem(yaKey, String(alcanzado));
          // No celebramos en la primera carga si ya venía superado (evita confeti
          // al abrir): solo cuando el hito se cruza estando ya en la página.
          if (!esPrimeraCarga) {
            setHito(alcanzado);
            setTimeout(() => setHito(null), 6000);
          }
        }
        setLastUpdated(new Date());
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMetric = (key: string) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Datos del gráfico con TODAS las métricas de la estructura por día (para
  // poder togglearlas con las tarjetas). Memoizado por `daily`.
  const chartData = useMemo(
    () =>
      daily.map((d) => {
        const point: Record<string, number | string> = {
          date: new Date(d.date + "T00:00:00Z").toLocaleDateString("es-ES", {
            month: "short",
            day: "2-digit",
            timeZone: "UTC",
          }),
        };
        metricConfig.forEach((m) => {
          point[m.key] = Number((d as unknown as Record<string, number>)[m.key] ?? 0);
        });
        return point;
      }),
    [daily]
  );

  const primaryMetricKey =
    activeMetrics.size > 0 ? Array.from(activeMetrics)[0] : "commission";

  if (loading) return <DashboardSkeleton />;
  if (loadError) return <LoadError onRetry={() => load()} />;

  const sinActividad =
    totals.totalClean === 0 && totals.clicks === 0 && totals.ftd === 0;

  // Crecimiento: lo que llevas ganado HOY vs lo de AYER (de la serie diaria).
  const fechaMadrid = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
  const hoyIso = fechaMadrid(new Date());
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerIso = fechaMadrid(ayer);
  const hoyE = daily.find((d) => d.date === hoyIso)?.earnings ?? 0;
  const ayerRow = daily.find((d) => d.date === ayerIso);
  const ayerE = ayerRow?.earnings ?? 0;
  const delta = hoyE - ayerE;
  // Solo comparamos con ayer si ayer está en los datos del mes (no el día 1).
  const hayAyer = !!ayerRow;

  // Comparativa JUSTA: mes actual vs el mes pasado HASTA EL MISMO DÍA (no contra
  // el mes pasado completo, que a mitad de mes daría siempre negativo).
  const pctMes =
    lastMonthToDate && lastMonthToDate > 0
      ? ((totals.totalClean - lastMonthToDate) / lastMonthToDate) * 100
      : null;

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
      {hito !== null && (
        <>
          <Confetti />
          <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
            <div className="animate-celebra bg-amber-500 text-black font-semibold px-5 py-3 rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.7)] flex items-center gap-2">
              <span className="text-xl">🏆</span> ¡Has pasado los {eur(hito)} este mes!
            </div>
          </div>
        </>
      )}
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
                · <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 align-middle animate-latido" /> Actualizado{" "}
                {lastUpdated.toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                <span className="text-[0.5em] opacity-70">
                  :{String(lastUpdated.getSeconds()).padStart(2, "0")}
                </span>
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

      {/* Aviso de seguridad del dinero (solo si algo requiere revisión). Es lo
          más prioritario: FTD retenidos por sospecha o un doble pago detectado. */}
      {seguridad && !seguridad.ok && (
        <Link
          href="/admin/actividad"
          className="animate-in flex items-center justify-between gap-3 bg-red-500/15 border border-red-400/60 rounded-xl px-5 py-4 hover:bg-red-500/25 transition-colors"
        >
          <span className="flex items-center gap-3">
            <ShieldAlert size={20} className="text-red-400 shrink-0" />
            <span className="text-sm text-red-100">
              {seguridad.retenidos > 0 && (
                <>
                  <b className="text-white">
                    {seguridad.retenidos} FTD retenido
                    {seguridad.retenidos === 1 ? "" : "s"}
                  </b>{" "}
                  sin contar, a la espera de que lo revises.
                </>
              )}
              {seguridad.dobles > 0 && (
                <>
                  {seguridad.retenidos > 0 ? " " : ""}
                  <b className="text-white">
                    {seguridad.dobles} posible doble pago
                  </b>{" "}
                  detectado.
                </>
              )}
            </span>
          </span>
          <span className="text-xs font-semibold text-red-300 whitespace-nowrap">
            Revisar →
          </span>
        </Link>
      )}

      {/* Salud de FreshBet: avisa si lleva días sin enviar NINGÚN evento pese a
          haber tráfico (posible configuración rota = fuga de dinero silenciosa). */}
      {freshbet?.alerta && (
        <Link
          href="/admin/actividad"
          className="animate-in flex items-center justify-between gap-3 bg-amber-500/15 border border-amber-400/50 rounded-xl px-5 py-4 hover:bg-amber-500/25 transition-colors"
        >
          <span className="flex items-center gap-3">
            <ShieldAlert size={20} className="text-amber-400 shrink-0" />
            <span className="text-sm text-amber-100">
              FreshBet lleva <b className="text-white">{freshbet.diasSin} días</b> sin
              enviar ningún evento, pero ha habido{" "}
              <b className="text-white">{freshbet.clics7} clics</b>. Puede que se
              haya desconfigurado — compruébalo.
            </span>
          </span>
          <span className="text-xs font-semibold text-amber-300 whitespace-nowrap">
            Revisar →
          </span>
        </Link>
      )}

      {/* Aviso de solicitudes pendientes (solo si hay). Se ve nada más entrar. */}
      {pendientes > 0 && (
        <Link
          href="/admin/solicitudes"
          className="animate-in flex items-center justify-between gap-3 bg-amber-500/15 border border-amber-400/50 rounded-xl px-5 py-4 hover:bg-amber-500/25 transition-colors"
        >
          <span className="flex items-center gap-3">
            <UserPlus size={20} className="text-amber-400 shrink-0" />
            <span className="text-sm text-amber-100">
              Tienes{" "}
              <b className="text-white">
                {pendientes} {pendientes === 1 ? "solicitud" : "solicitudes"}
              </b>{" "}
              pendiente{pendientes === 1 ? "" : "s"} de aprobar
            </span>
          </span>
          <span className="text-xs font-semibold text-amber-300 whitespace-nowrap">
            Ver →
          </span>
        </Link>
      )}

      {/* Lo que me llevo limpio */}
      <div
        className="animate-in bg-white/10 backdrop-blur border border-emerald-400/50 rounded-xl p-7 max-w-lg shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="group relative flex items-center gap-1.5 mb-3">
          <span className="text-sm font-medium text-slate-300">Mi balance</span>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Ver desglose"
              className="flex items-center p-2 -m-2 text-slate-400 hover:text-slate-300"
            >
              <Info size={16} className="cursor-help" />
            </button>
            <div
              className={`pointer-events-none absolute left-0 top-8 z-10 w-64 max-w-[calc(100vw-2.5rem)] rounded-lg border border-white/20 bg-black/95 backdrop-blur p-3 shadow-xl transition-opacity group-hover:opacity-100 ${
                showInfo ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-300">Mi link propio</span>
                <span className="font-medium text-white">{eur(totals.ownEarnings)}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="text-slate-300">Mi estructura</span>
                <span className="font-medium text-white">{eur(totals.structureMarginNet)}</span>
              </div>
              <div className="flex items-center justify-between py-1 text-sm border-t border-white/10 mt-1 pt-2">
                <span className="text-slate-300">Mi balance</span>
                <span className="font-semibold text-emerald-400">{eur(totals.totalClean)}</span>
              </div>
            </div>
        </div>
        <p className="text-3xl sm:text-4xl font-bold text-white">{eur(totals.totalClean)}</p>
        {/* Crecimiento de hoy vs ayer */}
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-slate-300">
            Hoy <b className="text-white">{eur(hoyE)}</b>
          </span>
          {hayAyer &&
            (delta === 0 ? (
              <span className="text-slate-500">· igual que ayer</span>
            ) : (
              <span
                className={`inline-flex items-center gap-0.5 font-semibold ${
                  delta > 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {eur(Math.abs(delta))}
                <span className="text-slate-500 font-normal">vs ayer</span>
              </span>
            ))}
        </div>
        {/* Comparativa justa: a estas alturas del mes pasado (mismo día). */}
        {lastMonthToDate !== null && lastMonthToDate > 0 && pctMes !== null && (
          <div className="mt-1 text-xs">
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${
                pctMes >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {pctMes >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {eur(Math.abs(totals.totalClean - lastMonthToDate))}
            </span>{" "}
            <span className="text-slate-500">que el mes pasado a estas alturas</span>
          </div>
        )}
      </div>


      {/* Lo que hacen mis afiliados — tarjetas clicables que controlan el gráfico */}
      <div className="animate-in grid grid-cols-2 md:grid-cols-4 gap-3" style={{ animationDelay: "0.12s" }}>
        {[
          { key: "commission", label: "Comisión", value: eur(totals.structurePaid), color: "#10b981" },
          { key: "clicks", label: "Clics", value: totals.clicks.toLocaleString("de-DE"), color: "#9333ea" },
          { key: "registrations", label: "Registros", value: totals.registrations.toLocaleString("de-DE"), color: "#f59e0b" },
          { key: "ftd", label: "FTD", value: totals.ftd.toLocaleString("de-DE"), color: "#38bdf8" },
        ].map((c) => {
          const isActive = activeMetrics.has(c.key);
          return (
            <button
              key={c.key}
              onClick={() => toggleMetric(c.key)}
              className={`text-left p-4 rounded-xl border border-white/15 border-t-4 bg-black/40 hover:bg-black/60 hover:-translate-y-0.5 transition duration-200 cursor-pointer ${
                isActive ? "opacity-100" : "opacity-50"
              }`}
              style={{ borderTopColor: c.color }}
            >
              <p className="text-sm text-slate-300 mb-1">{c.label}</p>
              <p className="text-xl font-bold text-white">{c.value}</p>
            </button>
          );
        })}
      </div>

      {/* Gráfico de la actividad de mis afiliados (según las tarjetas activas) */}
      <div className="animate-in relative bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3 sm:p-6" style={{ animationDelay: "0.18s" }}>
        <BalanceChart
          data={chartData.length ? chartData : [{ date: "", commission: 0 }]}
          activeMetrics={activeMetrics}
          primaryMetricKey={primaryMetricKey}
        />
        {sinActividad && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-slate-400 bg-black/50 border border-white/10 px-3 py-1.5 rounded-lg">
              Aún no hay actividad
            </p>
          </div>
        )}
      </div>

      {/* De dónde vienen los jugadores. */}
      {paises.length > 0 && (
        <div className="animate-in bg-white/10 backdrop-blur border border-white/20 rounded-xl p-5 max-w-lg" style={{ animationDelay: "0.22s" }}>
          <p className="text-sm font-medium text-slate-300 mb-3">🌍 De dónde vienen</p>
          <div className="flex flex-col gap-2">
            {paises.slice(0, 6).map((p) => (
              <div key={p.code} className="flex items-center justify-between text-sm">
                <span className="text-white">
                  {banderaEmoji(p.code)}{" "}
                  <span className="text-slate-300">{nombrePais(p.code)}</span>
                </span>
                <span className="font-semibold text-white">{p.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// Bandera emoji desde el código ISO de país (2 letras). 🌐 si desconocido.
function banderaEmoji(code: string): string {
  if (!code || code.length !== 2 || code === "??") return "🌐";
  try {
    return code
      .toUpperCase()
      .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  } catch {
    return "🌐";
  }
}
const NOMBRES_PAIS: Record<string, string> = {
  ES: "España", IT: "Italia", PT: "Portugal", FR: "Francia", DE: "Alemania",
  MX: "México", AR: "Argentina", CO: "Colombia", PE: "Perú", CL: "Chile",
  BR: "Brasil", GB: "Reino Unido", US: "EE. UU.", "??": "Desconocido",
};
function nombrePais(code: string): string {
  return NOMBRES_PAIS[code] ?? code;
}
