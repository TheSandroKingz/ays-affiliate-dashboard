"use client";

// Fase 1b — pantalla del "Aprendizaje supervisado desde el historial" (spec de Yaiza).
// Enseña el informe que el backend genera solo (Fase 1). Lo ven el admin y los
// gestores del bot (Yaiza). El botón "Actualizar ahora" es SOLO admin (dispara la
// clasificación + informe a mano, sin depender del cron). NO ajusta el bot: es
// revisión HUMANA de calidad técnica.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw } from "lucide-react";

type Ejemplo = { bot: string; tipo: string; resumen: string };
type Datos = {
  total: number;
  problemas_tecnicos: number;
  tasa_resolucion: number | null;
  resueltos: number;
  no_resueltos: number;
  sin_determinar: number;
  derivaciones_soporte: number;
  fricciones_abandono: number;
  por_tipo_duda: [string, number][];
  por_bot: [string, number][];
  ejemplos_no_resueltos: Ejemplo[];
  ejemplos_friccion: Ejemplo[];
};
type Informe = { id: number; desde: string; hasta: string; datos: Datos; created_at: string };
type Resp = {
  informe: Informe | null;
  config: { umbral: number; ultimo_run: string | null; ultimo_informe: string | null } | null;
  clasificadas_total: number;
};

const NOMBRE_BOT: Record<string, string> = {
  as: "Sandro",
  jeffer: "Jeffer",
  mariam: "Livana",
  blackkp: "Black KP",
  afrika: "iAfrika",
};
const NOMBRE_DUDA: Record<string, string> = {
  deposito: "Depósito",
  retiro: "Retiro",
  bono: "Bono",
  acceso: "Acceso",
  juego: "Juego",
  patron: "Patrón",
  pago: "Pago",
  social: "Social",
  otro: "Otro",
};

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
function haceCuanto(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export default function InformeAnalisis({ isAdmin = false }: { isAdmin?: boolean }) {
  const [resp, setResp] = useState<Resp | null>(null);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    setError(null);
    try {
      const r = await fetch("/api/admin/analisis", {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      if (!r.ok) throw new Error("No se pudo cargar el informe");
      setResp((await r.json()) as Resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function actualizarAhora() {
    setGenerando(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const h = { Authorization: "Bearer " + session.access_token };
      // Clasifica un lote y luego genera el informe agregado.
      await fetch("/api/admin/analisis?run=lote", { method: "POST", headers: h });
      await fetch("/api/admin/analisis?run=informe", { method: "POST", headers: h });
      await cargar();
    } catch {
      setError("No se pudo actualizar");
    } finally {
      setGenerando(false);
    }
  }

  const inf = resp?.informe;
  const d = inf?.datos;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      {isAdmin && (
        <div className="flex justify-end mb-4">
          <button
            onClick={actualizarAhora}
            disabled={generando}
            className="shrink-0 flex items-center gap-2 rounded-lg border border-white/15 bg-white/5
            px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw size={14} className={generando ? "animate-spin" : ""} />
            {generando ? "Analizando…" : "Actualizar ahora"}
          </button>
        </div>
      )}

      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}
      {error && !cargando && <p className="text-sm text-rose-300">{error}</p>}

      {!cargando && !error && !inf && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
          Aún no hay ningún informe.{" "}
          {resp?.clasificadas_total
            ? `Ya hay ${resp.clasificadas_total} conversaciones clasificadas; el primer informe saldrá en el próximo ciclo.`
            : "Se generará automáticamente cuando haya conversaciones cerradas que analizar."}
          {isAdmin && " Puedes pulsar «Actualizar ahora» para generarlo ya."}
        </div>
      )}

      {!cargando && inf && d && (
        <div className="flex flex-col gap-5">
          <p className="text-xs text-slate-500">
            Periodo {fechaCorta(inf.desde)} – {fechaCorta(inf.hasta)} · generado {haceCuanto(inf.created_at)}
          </p>

          {/* Métricas clave */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Conversaciones" valor={d.total} />
            <Metric label="Problemas técnicos" valor={d.problemas_tecnicos} />
            <Metric
              label="Se resolvieron"
              valor={d.tasa_resolucion == null ? "—" : `${d.tasa_resolucion}%`}
              tono={d.tasa_resolucion != null && d.tasa_resolucion < 50 ? "malo" : "bueno"}
            />
            <Metric label="A soporte" valor={d.derivaciones_soporte} />
          </div>

          {/* Dudas más comunes */}
          {d.por_tipo_duda?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Dudas más comunes</h3>
              <div className="flex flex-col gap-1.5">
                {d.por_tipo_duda.slice(0, 6).map(([k, n]) => {
                  const max = d.por_tipo_duda[0][1] || 1;
                  return (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-xs text-slate-400">
                        {NOMBRE_DUDA[k] || k}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sky-400/70"
                          style={{ width: `${Math.round((n / max) * 100)}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs tabular-nums text-slate-300">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ejemplos no resueltos — para revisar a mano */}
          {d.ejemplos_no_resueltos?.length > 0 && (
            <ListaEjemplos
              titulo="Casos NO resueltos (para revisar)"
              color="rose"
              items={d.ejemplos_no_resueltos}
            />
          )}

          {/* Fricciones */}
          {d.ejemplos_friccion?.length > 0 && (
            <ListaEjemplos
              titulo="Se cortaron por un fallo técnico"
              color="amber"
              items={d.ejemplos_friccion}
            />
          )}

          {d.problemas_tecnicos === 0 && (d.ejemplos_no_resueltos?.length ?? 0) === 0 && (
            <p className="text-sm text-emerald-300">
              Sin problemas técnicos detectados en este periodo. 👌
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  valor,
  tono = "neutro",
}: {
  label: string;
  valor: string | number;
  tono?: "bueno" | "malo" | "neutro";
}) {
  const color =
    tono === "malo" ? "text-rose-300" : tono === "bueno" ? "text-emerald-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-[11px] text-slate-400 leading-tight">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold tabular-nums ${color}`}>{valor}</div>
    </div>
  );
}

function ListaEjemplos({
  titulo,
  color,
  items,
}: {
  titulo: string;
  color: "rose" | "amber";
  items: Ejemplo[];
}) {
  const borde = color === "rose" ? "border-rose-400/30" : "border-amber-400/30";
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-300 mb-2">{titulo}</h3>
      <div className="flex flex-col gap-2">
        {items.slice(0, 8).map((e, i) => (
          <div key={i} className={`rounded-lg border ${borde} bg-black/20 px-3 py-2`}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-medium text-slate-300">
                {NOMBRE_BOT[e.bot] || e.bot}
              </span>
              <span className="text-[11px] text-slate-500">· {NOMBRE_DUDA[e.tipo] || e.tipo}</span>
            </div>
            <p className="text-xs text-slate-400 leading-snug">{e.resumen}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
