"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { TableSkeleton } from "@/components/Skeletons";
import { Upload } from "lucide-react";

const BalanceChart = dynamic(() => import("@/components/BalanceChart"), {
  ssr: false,
});

type StatRow = {
  user_id: string;
  display_name: string | null;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

type Totals = {
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

type FreshbetRow = {
  day: string;
  commission: number;
  clicks: number;
  registrations: number;
  ftd: number;
};

const emptyTotals: Totals = { commission: 0, clicks: 0, registrations: 0, ftd: 0 };

function fmt(n: number) {
  return n.toLocaleString("de-DE");
}

function money(n: number) {
  return "€" + n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export default function AdminStatsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  // Afiliados (postbacks)
  const [stats, setStats] = useState<StatRow[] | null>(null);
  const [totals, setTotals] = useState<Totals>(emptyTotals);

  // Freshbet (histórico importado)
  const [fbRows, setFbRows] = useState<FreshbetRow[]>([]);
  const [fbTotals, setFbTotals] = useState<Totals>(emptyTotals);

  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadFreshbet(accessToken: string) {
    const res = await fetch("/api/admin/freshbet", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    const body = await res.json();
    if (res.ok) {
      setFbRows(body.rows ?? []);
      setFbTotals(body.totals ?? emptyTotals);
    }
  }

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
        return;
      }
      setToken(session.access_token);

      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Error al cargar");
        setLoaded(true);
        return;
      }

      setStats(body.stats);
      setTotals(body.totals);
      await loadFreshbet(session.access_token);
      setLoaded(true);
    }
    load();
  }, [router]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/admin/freshbet", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "text/csv",
        },
        body: text,
      });
      const body = await res.json();
      if (!res.ok) {
        setUploadMsg(body.error || "No se pudo subir el archivo.");
      } else {
        setUploadMsg(`Importado correctamente (${body.imported} días).`);
        await loadFreshbet(token);
      }
    } catch {
      setUploadMsg("No se pudo leer el archivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const fbChartData = fbRows.map((r) => ({
    date: r.day.slice(5).replace("-", "/"), // "07/01"
    commission: Number(r.commission),
    clicks: Number(r.clicks),
    registrations: Number(r.registrations),
    ftd: Number(r.ftd),
  }));

  const fbCards = [
    { label: "Visitas", value: fmt(fbTotals.clicks), color: "#9333ea" },
    { label: "Registros", value: fmt(fbTotals.registrations), color: "#f59e0b" },
    { label: "FTD", value: fmt(fbTotals.ftd), color: "#38bdf8" },
  ];

  const affCards = [
    { label: "Clics", value: fmt(totals.clicks), color: "#9333ea" },
    { label: "Registros", value: fmt(totals.registrations), color: "#f59e0b" },
    { label: "FTD", value: fmt(totals.ftd), color: "#38bdf8" },
  ];

  if (!loaded) {
    return <TableSkeleton title="Panel de Admin" cols={5} />;
  }

  if (error) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">Panel de Admin</h1>
        <p className="text-red-400">Error: {error}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-10">
      {/* ============ ZONA 1: MI FRESHBET (lo que ingreso) ============ */}
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Mi Freshbet</h1>
            <p className="text-sm text-slate-400 mt-1">
              Tu histórico de ingresos en freshbet (toda tu red junta).
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-50"
            >
              <Upload size={16} />
              {uploading ? "Subiendo..." : "Actualizar CSV"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="hidden"
            />
            {uploadMsg && (
              <span
                className={`text-xs ${
                  /correctamente|Importado/.test(uploadMsg)
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {uploadMsg}
              </span>
            )}
          </div>
        </div>

        {/* Balance freshbet */}
        <div className="bg-white/10 backdrop-blur border border-emerald-400/50 rounded-xl p-7 max-w-lg shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]">
          <p className="text-sm font-medium text-slate-300 mb-3">
            Comisión total en freshbet
          </p>
          <p className="text-4xl font-bold text-white">{money(fbTotals.commission)}</p>
        </div>

        {/* Tarjetas freshbet */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {fbCards.map((card) => (
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

        {/* Gráfico freshbet */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          {fbChartData.length === 0 ? (
            <p className="text-center text-slate-400 py-16 text-sm">
              Aún no has importado tu histórico. Pulsa «Actualizar CSV» y sube el
              informe exportado de freshbet.
            </p>
          ) : (
            <BalanceChart
              data={fbChartData}
              activeMetrics={new Set(["commission"])}
              primaryMetricKey="commission"
            />
          )}
        </div>
      </section>

      {/* ============ ZONA 2: MIS AFILIADOS (lo que les pago) ============ */}
      <section className="flex flex-col gap-5">
        <div>
          <h2 className="text-2xl font-semibold text-white">Mis Afiliados</h2>
          <p className="text-sm text-slate-400 mt-1">
            Lo que genera cada afiliado (para pagarle). No se suma con freshbet.
          </p>
        </div>

        {/* Tarjetas de totales de afiliados */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                  Comisión
                </th>
              </tr>
            </thead>
            <tbody>
              {!stats || stats.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
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
                    <td className="border border-white/10 px-4 py-3 text-white">
                      {row.display_name ?? "—"}
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
                    <td className="border border-white/10 px-4 py-3 text-right text-white font-medium">
                      {money(row.commission)}
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
                  <td className="border border-white/10 px-4 py-3 text-right text-white">
                    {money(totals.commission)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </main>
  );
}
