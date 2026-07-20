"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { TableSkeleton } from "@/components/Skeletons";
import LoadError from "@/components/LoadError";
import { eur } from "@/lib/format";
import { tiempoRelativo } from "@/lib/ui";

type Evento = {
  id: number;
  created_at: string;
  event_type: "registration" | "ftd" | "commission";
  status: "counted" | "duplicate" | "no_match" | "error" | "held" | "discarded";
  counted: boolean;
  commission: number | null;
  player_id: string | null;
  tracking_code: string | null;
  afp: string | null;
  isocountry: string | null;
  name: string | null;
};

const TIPO: Record<string, string> = {
  ftd: "FTD",
  registration: "Registro",
  commission: "Comisión",
};

function estadoBadge(e: Evento) {
  if (e.status === "counted")
    return { label: "Contado", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40" };
  if (e.status === "duplicate")
    return { label: "Duplicado", cls: "bg-amber-500/20 text-amber-300 border-amber-400/40" };
  if (e.status === "held")
    return { label: "Retenido", cls: "bg-red-500/20 text-red-300 border-red-400/50" };
  if (e.status === "discarded")
    return { label: "Descartado", cls: "bg-white/10 text-slate-400 border-white/20" };
  if (e.status === "error")
    return { label: "Error", cls: "bg-red-500/20 text-red-300 border-red-400/40" };
  return { label: "Sin emparejar", cls: "bg-white/10 text-slate-300 border-white/20" };
}

export default function ActividadPage() {
  const router = useRouter();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [retenidos, setRetenidos] = useState<Evento[]>([]);
  const [sinPlayerId, setSinPlayerId] = useState(0);
  const [resumen, setResumen] = useState<{
    sinPlayerId: number;
    duplicados: number;
    noMatch: number;
    repetidos: { player_id: string; veces: number }[];
  } | null>(null);
  const [resolviendo, setResolviendo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
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
      const res = await fetch("/api/admin/actividad", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = await res.json();
      setEventos(Array.isArray(body.events) ? body.events : []);
      setRetenidos(Array.isArray(body.retenidos) ? body.retenidos : []);
      setSinPlayerId(Number(body.sinPlayerId ?? 0));
      setResumen(body.resumen ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  // Resolver un FTD retenido: contarlo (sumar el CPA) o descartarlo.
  const resolver = useCallback(
    async (id: number, accion: "contar" | "descartar") => {
      if (accion === "contar" && !confirm("¿Contar este FTD y sumar el CPA al afiliado?"))
        return;
      if (accion === "descartar" && !confirm("¿Descartar este FTD? No se sumará nada."))
        return;
      setResolviendo(id);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch("/api/admin/actividad/resolver", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + session.access_token,
          },
          body: JSON.stringify({ id, accion }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          alert(b.error || "No se pudo resolver.");
          return;
        }
        await load(true);
      } finally {
        setResolviendo(null);
      }
    },
    [load]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <TableSkeleton title="Actividad" cols={6} />;
  if (error)
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">Actividad</h1>
        <LoadError onRetry={() => load()} />
      </main>
    );

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Actividad</h1>
          <p className="text-sm text-slate-400 mt-1">
            Últimos eventos que manda freshbet (registros, FTD, comisión).
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {refreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {/* FTD RETENIDOS: frenados por sospecha de doble pago. NO se han contado.
          Tú decides: contar (sumar el CPA) o descartar. */}
      {retenidos.length > 0 && (
        <div className="rounded-xl border border-red-400/60 bg-red-500/15 p-4">
          <p className="text-sm font-semibold text-red-100 flex items-center gap-2">
            🛑 {retenidos.length} FTD retenido{retenidos.length === 1 ? "" : "s"} — sin
            contar hasta que decidas
          </p>
          <p className="text-xs text-red-200/80 mt-1 mb-3">
            Este jugador ya tenía un FTD contado, así que no se ha sumado el dinero
            para evitar un doble pago. Revísalo y decide.
          </p>
          <div className="flex flex-col gap-2">
            {retenidos.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2"
              >
                <div className="text-sm text-white min-w-0">
                  <span className="font-medium">{e.name ?? e.tracking_code ?? "—"}</span>
                  <span className="text-slate-400">
                    {" "}
                    · jugador{" "}
                    <span className="font-mono text-xs">
                      {e.player_id?.startsWith("legacy:") ? "(antiguo)" : e.player_id}
                    </span>{" "}
                    · {tiempoRelativo(e.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => resolver(e.id, "descartar")}
                    disabled={resolviendo === e.id}
                    className="text-xs font-semibold text-slate-300 hover:text-white border border-white/20 hover:bg-white/10 disabled:opacity-50 px-3 py-1.5 rounded-lg transition"
                  >
                    Descartar
                  </button>
                  <button
                    onClick={() => resolver(e.id, "contar")}
                    disabled={resolviendo === e.id}
                    className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition"
                  >
                    {resolviendo === e.id ? "..." : "Contar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmación en verde: todo limpio (nada retenido, ni sin id, ni doble
          pago). Así "no hay avisos" te lo dice explícito y te quedas tranquilo. */}
      {resumen &&
        retenidos.length === 0 &&
        sinPlayerId === 0 &&
        resumen.repetidos.length === 0 && (
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
            ✔ Todo en orden — ningún doble pago ni FTD sospechoso. El dinero cuadra.
          </div>
        )}

      {sinPlayerId > 0 && (
        <div className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          ⚠️ Hay <b>{sinPlayerId}</b> FTD contados <b>sin identificador de jugador</b>.
          Sin ese dato, si freshbet reenvía un FTD se contaría dos veces. Revisa
          que freshbet incluya el <span className="font-mono">playerid</span> en los postbacks.
        </div>
      )}

      {resumen && resumen.repetidos.length > 0 && (
        <div className="rounded-xl border border-red-400/60 bg-red-500/15 px-4 py-3 text-sm text-red-100">
          🚨 <b>{resumen.repetidos.length}</b> jugador(es) contados MÁS de una vez
          (posible doble pago):{" "}
          <span className="font-mono">
            {resumen.repetidos.map((r) => `${r.player_id} (${r.veces}×)`).join(", ")}
          </span>
          . Revísalo cuanto antes.
        </div>
      )}

      {resumen && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Sin player_id", value: resumen.sinPlayerId },
            { label: "Duplicados bloqueados", value: resumen.duplicados },
          ].map((c) => (
            <div key={c.label} className="p-3 rounded-xl border border-white/10 bg-white/5">
              <p className="text-xs text-slate-400 mb-1">{c.label}</p>
              <p className="text-lg font-bold text-white">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white/10 backdrop-blur border border-white/20 rounded-xl overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/10 text-slate-300 text-left">
              {["Cuándo", "Tipo", "Afiliado", "Estado", "Jugador", "CPA"].map((h) => (
                <th
                  key={h}
                  className="border border-white/10 px-4 py-3 uppercase tracking-wide text-xs font-semibold whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {eventos.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-white/10 px-4 py-6 text-center text-slate-400">
                  Todavía no hay eventos.
                </td>
              </tr>
            ) : (
              eventos.map((e, i) => {
                const b = estadoBadge(e);
                const fecha = tiempoRelativo(e.created_at);
                const fechaExacta = new Date(e.created_at).toLocaleString("es-ES", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <tr
                    key={e.id}
                    className={`text-white ${i % 2 === 1 ? "bg-white/[0.03]" : ""} hover:bg-white/10 transition-colors`}
                  >
                    <td
                      className="border border-white/10 px-4 py-3 whitespace-nowrap text-slate-300"
                      title={fechaExacta}
                    >
                      {fecha}
                    </td>
                    <td className="border border-white/10 px-4 py-3 whitespace-nowrap">
                      {TIPO[e.event_type] ?? e.event_type}
                    </td>
                    <td className="border border-white/10 px-4 py-3 whitespace-nowrap">
                      {e.name ?? <span className="text-slate-500">{e.tracking_code || "—"}</span>}
                    </td>
                    <td className="border border-white/10 px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${b.cls}`}>
                        {b.label}
                      </span>
                    </td>
                    <td className="border border-white/10 px-4 py-3 whitespace-nowrap">
                      {e.player_id?.startsWith("legacy:") ? (
                        <span className="text-xs text-slate-500">(antiguo)</span>
                      ) : e.player_id ? (
                        <span className="font-mono text-xs text-slate-300">{e.player_id}</span>
                      ) : e.event_type === "ftd" && e.counted ? (
                        <span className="text-red-400 text-xs font-semibold">sin id ⚠️</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="border border-white/10 px-4 py-3 text-right whitespace-nowrap">
                      {e.counted && Number(e.commission) > 0 ? eur(Number(e.commission)) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
