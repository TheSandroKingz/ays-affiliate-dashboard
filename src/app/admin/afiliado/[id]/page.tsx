"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { TableSkeleton } from "@/components/Skeletons";
import LoadError from "@/components/LoadError";
import { eur } from "@/lib/format";
import { hoyMadridISO, colorDeNombre } from "@/lib/ui";

// La gráfica (Recharts) es pesada: la cargamos en diferido, igual que el inicio.
const BalanceChart = dynamic(() => import("@/components/BalanceChart"), {
  ssr: false,
  loading: () => <div className="h-[320px]" />,
});

type DailyRow = {
  date: string;
  clicks: number;
  registrations: number;
  ftd: number;
  commission: number;
};

type Perfil = {
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  cpa_spain: number | null;
  cpa_other: number | null;
  subaffiliate_percent: number | null;
  wallet_erc20: string | null;
  wallet_trc20: string | null;
  freshaffs_tracking_code: string | null;
  created_at: string | null;
  active?: boolean;
};

function fmt(n: number) {
  return n.toLocaleString("de-DE");
}

export default function AfiliadoDetallePage() {
  const params = useParams();
  const router = useRouter();
  const userId = String(params.id ?? "");

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [mostrarGestion, setMostrarGestion] = useState(false);
  const [periodo, setPeriodo] = useState<"mes" | "todo">("mes");
  const [nombreEdit, setNombreEdit] = useState("");
  const [gestionMsg, setGestionMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [gestionando, setGestionando] = useState(false);

  async function gestionar(cambios: { display_name?: string; active?: boolean }) {
    setGestionando(true);
    setGestionMsg(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/admin/afiliado", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({ userId, ...cambios }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.ok) {
        setGestionMsg({ texto: "Guardado ✓", ok: true });
        load(periodo, true);
      } else {
        setGestionMsg({ texto: b.error || "Error", ok: false });
      }
    } catch {
      setGestionMsg({ texto: "Error de red", ok: false });
    } finally {
      setGestionando(false);
    }
  }

  const load = useCallback(
    async (per: "mes" | "todo", isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(false);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session || session.user.id !== ADMIN_USER_ID) {
          router.replace("/dashboard");
          return;
        }
        // Por defecto el MES en curso (cuadra con "Le pago" de Estadísticas);
        // "Todo" muestra el histórico.
        let qs = "userId=" + encodeURIComponent(userId);
        if (per === "mes") {
          const hoy = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Madrid",
          }).format(new Date());
          qs += `&from=${hoy.slice(0, 7)}-01&to=${hoy}`;
        }
        const res = await fetch("/api/admin/afiliado?" + qs, {
          cache: "no-store",
          headers: { Authorization: "Bearer " + session.access_token },
        });
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = await res.json();
      setPerfil(body.perfil);
      setNombreEdit(body.perfil?.display_name ?? "");
      setDaily(Array.isArray(body.daily) ? body.daily : []);
      setLastUpdated(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, router]);

  useEffect(() => {
    load("mes");
  }, [load]);

  function cambiarPeriodo(per: "mes" | "todo") {
    setPeriodo(per);
    load(per);
  }

  // Datos para la gráfica: comisión por día en orden cronológico (la tabla va
  // al revés, de más reciente a más antiguo).
  const chartData = useMemo(
    () =>
      [...daily]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((d) => ({
          date: new Date(d.date + "T00:00:00Z").toLocaleDateString("es-ES", {
            month: "short",
            day: "2-digit",
            timeZone: "UTC",
          }),
          commission: Number(d.commission ?? 0),
        })),
    [daily]
  );

  const totals = useMemo(
    () =>
      daily.reduce(
        (acc, r) => ({
          clicks: acc.clicks + Number(r.clicks ?? 0),
          registrations: acc.registrations + Number(r.registrations ?? 0),
          ftd: acc.ftd + Number(r.ftd ?? 0),
          commission: acc.commission + Number(r.commission ?? 0),
        }),
        { clicks: 0, registrations: 0, ftd: 0, commission: 0 }
      ),
    [daily]
  );

  if (loading) {
    return <TableSkeleton title="Detalle del afiliado" cols={5} />;
  }

  if (error || !perfil) {
    return (
      <main className="flex flex-col gap-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft size={16} /> Volver
        </Link>
        <LoadError onRetry={() => load(periodo)} />
      </main>
    );
  }

  const fichas = [
    { label: "CPA España", value: eur(Number(perfil.cpa_spain ?? 0)) },
    { label: "CPA Otros", value: eur(Number(perfil.cpa_other ?? 0)) },
    { label: "% Subafiliados", value: `${Number(perfil.subaffiliate_percent ?? 0)}%` },
  ];

  return (
    <main className="flex flex-col gap-5">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft size={16} /> Volver a Mis Afiliados
      </Link>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          {perfil.avatar_url ? (
            <Image
              src={perfil.avatar_url}
              alt={perfil.display_name ?? "Afiliado"}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full object-cover border border-white/20 shrink-0"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center text-xl font-bold text-white shrink-0"
              style={{ backgroundColor: colorDeNombre(perfil.display_name) }}
            >
              {(perfil.display_name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-white truncate">
              {perfil.display_name ?? "—"}
            </h1>
            {perfil.email && (
              <p className="text-sm text-slate-400 truncate">{perfil.email}</p>
            )}
            {lastUpdated && (
              <p className="text-sm text-slate-500 mt-1">
                Actualizado{" "}
                {lastUpdated.toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                <span className="text-[0.5em] opacity-70">
                  :{String(lastUpdated.getSeconds()).padStart(2, "0")}
                </span>
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => load(periodo, true)}
          disabled={refreshing}
          className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {/* Ficha: CPA y % */}
      <div className="grid grid-cols-3 gap-3">
        {fichas.map((f) => (
          <div
            key={f.label}
            className="p-4 rounded-xl border border-white/15 bg-black/40"
          >
            <p className="text-xs text-slate-400 mb-1">{f.label}</p>
            <p className="text-lg font-bold text-white">{f.value}</p>
          </div>
        ))}
      </div>

      {/* Datos de cobro (billeteras) y código — plegado por defecto */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <button
          onClick={() => setMostrarCobro((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5"
        >
          <span>Datos de cobro</span>
          <ChevronDown
            size={16}
            className={`transition-transform ${mostrarCobro ? "rotate-180" : ""}`}
          />
        </button>
        {mostrarCobro && (
          <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
            {[
              { label: "USDT (ERC-20)", value: perfil.wallet_erc20 },
              { label: "USDT (TRC-20)", value: perfil.wallet_trc20 },
              { label: "Código de tracking", value: perfil.freshaffs_tracking_code },
            ].map((w) => (
              <div key={w.label} className="flex flex-col gap-0.5">
                <span className="text-xs text-slate-400">{w.label}</span>
                <span className="text-sm text-white break-all font-mono">
                  {w.value ? w.value : <span className="text-slate-500">Sin definir</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gestión: editar nombre y activar/desactivar (plegado) */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <button
          onClick={() => setMostrarGestion((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-white/5"
        >
          <span>Gestión</span>
          <ChevronDown
            size={16}
            className={`transition-transform ${mostrarGestion ? "rotate-180" : ""}`}
          />
        </button>
        {mostrarGestion && (
          <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Nombre</label>
              <div className="flex items-center gap-2">
                <input
                  value={nombreEdit}
                  onChange={(e) => setNombreEdit(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg bg-white/10 border border-white/20 text-white text-base sm:text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={() => gestionar({ display_name: nombreEdit })}
                  disabled={gestionando}
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  Guardar
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <div>
                <p className="text-sm text-white">Estado de la cuenta</p>
                <p className="text-xs text-slate-400">
                  {perfil.active === false
                    ? "Desactivada — no puede entrar"
                    : "Activa"}
                </p>
              </div>
              <button
                onClick={() => {
                  const desactivando = perfil.active !== false;
                  if (
                    !desactivando ||
                    window.confirm(
                      `¿Desactivar a "${perfil.display_name ?? "este afiliado"}"? No podrá entrar hasta que lo reactives.`
                    )
                  ) {
                    gestionar({ active: perfil.active === false });
                  }
                }}
                disabled={gestionando}
                className={`shrink-0 text-sm font-semibold px-4 py-2 rounded-lg transition text-white disabled:opacity-60 ${
                  perfil.active === false
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600/80 hover:bg-red-600"
                }`}
              >
                {perfil.active === false ? "Activar" : "Desactivar"}
              </button>
            </div>
            {gestionMsg && (
              <span
                className={`text-xs ${
                  gestionMsg.ok ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {gestionMsg.texto}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Periodo: este mes (cuadra con "Le pago") o histórico */}
      <div className="inline-flex rounded-lg border border-white/20 overflow-hidden w-fit">
        {([
          { key: "mes", label: "Este mes" },
          { key: "todo", label: "Todo" },
        ] as const).map((p) => (
          <button
            key={p.key}
            onClick={() => cambiarPeriodo(p.key)}
            className={`px-4 py-2 text-sm ${
              periodo === p.key
                ? "bg-emerald-600 text-white"
                : "text-slate-300 hover:bg-white/10"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Gráfica de comisión por día (como la del inicio) */}
      <div className="relative bg-white/10 backdrop-blur border border-white/20 rounded-xl p-3 sm:p-6">
        <p className="text-sm font-medium text-slate-300 mb-2">Comisión por día</p>
        <BalanceChart
          data={chartData.length ? chartData : [{ date: "", commission: 0 }]}
          activeMetrics={new Set(["commission"])}
          primaryMetricKey="commission"
        />
        {daily.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-slate-400 bg-black/50 border border-white/10 px-3 py-1.5 rounded-lg">
              Aún no hay actividad
            </p>
          </div>
        )}
      </div>

      {/* Actividad diaria */}
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                Día
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Clics
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Registros
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                FTD
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Comisión
              </th>
            </tr>
          </thead>
          <tbody>
            {daily.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="border border-white/10 px-4 py-6 text-center text-slate-400"
                >
                  Todavía no hay actividad.
                </td>
              </tr>
            ) : (
              daily.map((r, i) => {
                const esHoy = String(r.date).slice(0, 10) === hoyMadridISO();
                return (
                <tr
                  key={r.date}
                  className={`text-white ${
                    esHoy
                      ? "bg-emerald-500/10"
                      : i % 2 === 1
                      ? "bg-white/[0.03]"
                      : ""
                  } hover:bg-white/10 transition-colors`}
                >
                  <td
                    className={`border border-white/10 px-4 py-3 ${
                      esHoy ? "border-l-2 border-l-emerald-500 font-medium" : ""
                    }`}
                  >
                    {new Date(r.date).toLocaleDateString("es-ES", { timeZone: "UTC" })}
                    {esHoy && <span className="text-emerald-400 text-xs"> · hoy</span>}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    {fmt(r.clicks)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    {fmt(r.registrations)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    {fmt(r.ftd)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right">
                    {eur(Number(r.commission))}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
          {daily.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 text-white font-semibold">
                <td className="border border-white/10 px-4 py-3">Total</td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {fmt(totals.clicks)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {fmt(totals.registrations)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {fmt(totals.ftd)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {eur(totals.commission)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}
