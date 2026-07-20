"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { TableSkeleton } from "@/components/Skeletons";
import { eur } from "@/lib/format";

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}
function inicioMes(iso: string): string {
  return iso.slice(0, 7) + "-01";
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function fmtCorto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

type StatRow = {
  user_id: string;
  display_name: string | null;
  commission: number; // su comisión propia
  overrideEarned: number; // lo que gana de sus subafiliados
  owed: number; // total que le pagas
  clicks: number;
  registrations: number;
  ftd: number;
  margin: number; // lo que te quedas tú
};

type Totals = {
  structurePaid: number;
  structureOwed: number;
  clicks: number;
  registrations: number;
  ftd: number;
  structureMargin: number;
};

const emptyTotals: Totals = {
  structurePaid: 0,
  structureOwed: 0,
  clicks: 0,
  registrations: 0,
  ftd: 0,
  structureMargin: 0,
};

function fmt(n: number) {
  return n.toLocaleString("de-DE");
}

export default function AdminStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatRow[] | null>(null);
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const load = useCallback(
    async (from: string, to: string) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
        return;
      }
      setRefreshing(true);
      setError(null);

      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString() ? "?" + params.toString() : "";

      try {
        const res = await fetch("/api/admin/stats" + qs, {
          headers: { Authorization: "Bearer " + session.access_token },
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || "Error al cargar");
        } else {
          setStats(body.stats);
          setTotals(body.totals);
          setLastUpdated(new Date());
        }
      } catch {
        setError("No se pudieron cargar los datos.");
      } finally {
        setLoaded(true);
        setRefreshing(false);
      }
    },
    [router]
  );

  useEffect(() => {
    load("", ""); // sin filtro = todo
  }, [load]);

  const hoy = hoyMadrid();
  const atajos = [
    { label: "Todo", from: "", to: "" },
    { label: "Hoy", from: hoy, to: hoy },
    { label: "Últimos 7 días", from: addDays(hoy, -6), to: hoy },
    { label: "Este mes", from: inicioMes(hoy), to: hoy },
    {
      label: "Mes pasado",
      from: inicioMes(addDays(inicioMes(hoy), -1)),
      to: addDays(inicioMes(hoy), -1),
    },
  ];

  const affCards = [
    { label: "Clics", value: fmt(totals.clicks), color: "#9333ea" },
    { label: "Registros", value: fmt(totals.registrations), color: "#f59e0b" },
    { label: "FTD", value: fmt(totals.ftd), color: "#38bdf8" },
  ];

  if (!loaded) {
    return <TableSkeleton title="Mis Afiliados" cols={6} />;
  }

  if (error) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">Mis Afiliados</h1>
        <p className="text-red-400">Error: {error}</p>
      </main>
    );
  }

  const rangoLabel =
    !desde && !hasta
      ? "Todo el histórico"
      : `${desde ? fmtCorto(desde) : "inicio"} – ${hasta ? fmtCorto(hasta) : "hoy"}`;

  return (
    <main className="flex flex-col gap-5">
      {/* Cabecera con Actualizar (como el inicio) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Mis Afiliados</h1>
          <p className="text-sm text-slate-400 mt-1">
            Lo que le pagas a cada uno y lo que te queda a ti.
            {lastUpdated && (
              <span className="text-slate-500">
                {" · Actualizado "}
                {lastUpdated.toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => load(desde, hasta)}
          disabled={refreshing}
          className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {/* Botón para desplegar el filtro (solo en móvil) */}
      <button
        onClick={() => setMostrarFiltros((v) => !v)}
        className="md:hidden flex items-center justify-between gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-xl px-4 py-3 text-sm text-white"
      >
        <span className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-400" />
          {rangoLabel}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${mostrarFiltros ? "rotate-180" : ""}`}
        />
      </button>

      {/* Filtro de fechas (plegado en móvil hasta desplegar; visible en escritorio) */}
      <div
        className={`${
          mostrarFiltros ? "flex" : "hidden"
        } md:flex flex-col gap-3 bg-white/5 border border-white/10 rounded-xl p-4`}
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Desde</label>
            <input
              type="date"
              value={desde}
              max={hasta || hoy}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 [color-scheme:dark] accent-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Hasta</label>
            <input
              type="date"
              value={hasta}
              min={desde}
              max={hoy}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 [color-scheme:dark] accent-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={() => load(desde, hasta)}
            disabled={refreshing}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            {refreshing ? "Aplicando..." : "Aplicar"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {atajos.map((a) => (
            <button
              key={a.label}
              onClick={() => {
                setDesde(a.from);
                setHasta(a.to);
                load(a.from, a.to);
              }}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Margen total de la estructura (el total limpio está en el inicio) */}
      <div className="bg-white/10 backdrop-blur border border-emerald-400/50 rounded-xl p-7 max-w-lg shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]">
        <p className="text-sm font-medium text-slate-300 mb-3">Mi margen de afiliados</p>
        <p className="text-4xl font-bold text-white">{eur(totals.structureMargin)}</p>
      </div>

      {/* Tarjetas de actividad de la red */}
      <div className="grid grid-cols-3 gap-3">
        {affCards.map((card) => (
          <div
            key={card.label}
            className="p-4 rounded-xl border border-white/20 border-t-4 bg-black/40"
            style={{ borderTopColor: card.color }}
          >
            <p className="text-sm text-slate-300 mb-1">{card.label}</p>
            <p className="text-xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tabla por afiliado */}
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold">
                Afiliado
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
                Le pago
              </th>
              <th className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold text-right">
                Mi margen
              </th>
            </tr>
          </thead>
          <tbody>
            {!stats || stats.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="border border-white/10 px-4 py-6 text-center text-slate-400"
                >
                  Todavía no hay estadísticas.
                </td>
              </tr>
            ) : (
              stats.map((row, i) => (
                <tr
                  key={row.user_id}
                  className={`${
                    i % 2 === 1 ? "bg-white/[0.03]" : ""
                  } hover:bg-white/10 transition-colors`}
                >
                  <td className="border border-white/10 px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/admin/afiliado/${row.user_id}`}
                      className="text-emerald-400 hover:text-emerald-300 hover:underline font-medium"
                    >
                      {row.display_name ?? "—"}
                    </Link>
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {fmt(row.clicks)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {fmt(row.registrations)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {fmt(row.ftd)}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-slate-300">
                    {eur(row.owed)}
                    {row.overrideEarned > 0 && (
                      <span className="block text-xs text-slate-500">
                        incl. {eur(row.overrideEarned)} de subs
                      </span>
                    )}
                  </td>
                  <td className="border border-white/10 px-4 py-3 text-right text-emerald-400 font-semibold">
                    {eur(row.margin)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {stats && stats.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 font-semibold">
                <td className="border border-white/10 px-4 py-3 text-white">
                  Total
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {fmt(totals.clicks)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {fmt(totals.registrations)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-white">
                  {fmt(totals.ftd)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-slate-300">
                  {eur(totals.structureOwed)}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right text-emerald-400">
                  {eur(totals.structureMargin)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}
