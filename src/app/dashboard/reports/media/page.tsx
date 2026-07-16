"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TableSkeleton } from "@/components/Skeletons";

type DailyRow = {
  date: string;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

// --- Utilidades de fecha (zona de Madrid, formato "YYYY-MM-DD") ---
function hoyMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(
    new Date()
  );
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

export default function MediaReportPage() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [desde, setDesde] = useState(inicioMes(hoyMadrid()));
  const [hasta, setHasta] = useState(hoyMadrid());
  const [agrupar, setAgrupar] = useState<"dia" | "mes">("dia");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  async function fetchData(from: string, to: string, isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const { data } = await supabase
      .from("affiliate_daily_stats")
      .select("date, commission, clicks, registrations, ftd")
      .eq("user_id", user.id)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false });
    setRows((data as DailyRow[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    fetchData(inicioMes(hoyMadrid()), hoyMadrid());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function atajo(from: string, to: string) {
    setDesde(from);
    setHasta(to);
    fetchData(from, to, true);
  }

  const hoy = hoyMadrid();
  const atajos = [
    { label: "Hoy", from: hoy, to: hoy },
    { label: "Ayer", from: addDays(hoy, -1), to: addDays(hoy, -1) },
    { label: "Últimos 7 días", from: addDays(hoy, -6), to: hoy },
    { label: "Últimos 30 días", from: addDays(hoy, -29), to: hoy },
    { label: "Este mes", from: inicioMes(hoy), to: hoy },
    {
      label: "Mes pasado",
      from: inicioMes(addDays(inicioMes(hoy), -1)),
      to: addDays(inicioMes(hoy), -1),
    },
  ];

  const filas: { etiqueta: string; row: DailyRow }[] = useMemo(
    () =>
      agrupar === "mes"
      ? Array.from(
          rows
            .reduce((map, r) => {
              const key = String(r.date).slice(0, 7);
              const acc = map.get(key) ?? {
                date: key,
                commission: 0,
                clicks: 0,
                registrations: 0,
                ftd: 0,
              };
              acc.commission += Number(r.commission);
              acc.clicks += r.clicks;
              acc.registrations += r.registrations;
              acc.ftd += r.ftd;
              map.set(key, acc);
              return map;
            }, new Map<string, DailyRow>())
            .values()
        )
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .map((r) => {
            const s = new Date(r.date + "-01").toLocaleDateString("es-ES", {
              month: "long",
              year: "numeric",
            });
            return { etiqueta: s.charAt(0).toUpperCase() + s.slice(1), row: r };
          })
      : rows.map((r) => ({
          etiqueta: new Date(r.date).toLocaleDateString("es-ES", {
            timeZone: "UTC",
          }),
          row: r,
        })),
    [rows, agrupar]
  );

  const totals = useMemo(
    () =>
      filas.reduce(
        (acc, { row }) => ({
          commission: acc.commission + Number(row.commission),
          clicks: acc.clicks + row.clicks,
          registrations: acc.registrations + row.registrations,
          ftd: acc.ftd + row.ftd,
        }),
        { commission: 0, clicks: 0, registrations: 0, ftd: 0 }
      ),
    [filas]
  );

  const inputClass =
    "rounded-lg bg-white/10 border border-white/20 text-white text-sm px-3 py-2 [color-scheme:dark] accent-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  if (loading) {
    return <TableSkeleton title="Informe de Medios" cols={5} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-white">Informe de Medios</h1>

      {/* Botón para desplegar los filtros (solo en móvil) */}
      <button
        onClick={() => setMostrarFiltros((v) => !v)}
        className="md:hidden flex items-center justify-between gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-xl px-4 py-3 text-sm text-white"
      >
        <span className="flex items-center gap-2">
          <Calendar size={16} className="text-slate-400" />
          {fmtCorto(desde)} – {fmtCorto(hasta)} · {agrupar === "mes" ? "Mes" : "Día"}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${mostrarFiltros ? "rotate-180" : ""}`}
        />
      </button>

      {/* Controles (plegados en móvil hasta desplegar; siempre visibles en escritorio) */}
      <div
        className={`${
          mostrarFiltros ? "flex" : "hidden"
        } md:flex flex-col gap-4 bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 sm:p-6`}
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Desde</label>
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className={inputClass}
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
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Ver por</label>
            <div className="inline-flex rounded-lg border border-white/20 overflow-hidden">
              <button
                onClick={() => setAgrupar("dia")}
                className={`px-3 py-2 text-sm ${
                  agrupar === "dia"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-300 hover:bg-white/10"
                }`}
              >
                Día
              </button>
              <button
                onClick={() => setAgrupar("mes")}
                className={`px-3 py-2 text-sm ${
                  agrupar === "mes"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-300 hover:bg-white/10"
                }`}
              >
                Mes
              </button>
            </div>
          </div>

          <button
            onClick={() => fetchData(desde, hasta, true)}
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
              onClick={() => atajo(a.from, a.to)}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                {agrupar === "mes" ? "Mes" : "Día"}
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Comisión
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Clics
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                Registros
              </th>
              <th className="border border-white/10 px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">
                FTD
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ etiqueta, row }, i) => (
              <tr
                key={row.date}
                className={`text-white ${
                  i % 2 === 1 ? "bg-white/[0.03]" : ""
                } hover:bg-white/10 transition-colors`}
              >
                <td className="border border-white/10 px-4 py-3">
                  {etiqueta}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  €{Number(row.commission).toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {row.clicks.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {row.registrations.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {row.ftd.toLocaleString("de-DE")}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="border border-white/10 px-4 py-6 text-center text-slate-400"
                >
                  Aún no hay datos en este rango.
                </td>
              </tr>
            )}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="bg-white/10 text-white font-semibold">
                <td className="border border-white/10 px-4 py-3">Total</td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  €{totals.commission.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {totals.clicks.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {totals.registrations.toLocaleString("de-DE")}
                </td>
                <td className="border border-white/10 px-4 py-3 text-right">
                  {totals.ftd.toLocaleString("de-DE")}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
