"use client";

// Fase 1b — pantalla del "Aprendizaje supervisado desde el historial" (spec de Yaiza).
// Enseña el informe que el backend genera solo (Fase 1). Lo ven el admin y los
// gestores del bot (Yaiza). El botón "Actualizar ahora" es SOLO admin (dispara la
// clasificación + informe a mano, sin depender del cron). NO ajusta el bot: es
// revisión HUMANA de calidad técnica.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { RefreshCw } from "lucide-react";

type Ejemplo = { bot: string; chat_id?: number | null; tipo?: string; resumen: string };
type SolucionDup = { id: number; problema: string; solucion: string };
type SolucionPendiente = {
  id: number;
  bot: string | null;
  problema: string;
  solucion: string;
  origen_bot: string | null;
  origen_chat_id: number | null;
  dup: SolucionDup | null;
};
type SolucionReutilizada = { id: number; veces: number; bot: string | null; problema: string };
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
  decepciones?: number;
  ejemplos_decepcion?: Ejemplo[];
  soluciones_pendientes?: SolucionPendiente[];
  soluciones_reutilizadas?: SolucionReutilizada[];
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

export default function InformeAnalisis() {
  const [resp, setResp] = useState<Resp | null>(null);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A qué visor de chats enlazan los ejemplos: admin → /admin/telegram, Yaiza → /dashboard/bot.
  const [viewerBase, setViewerBase] = useState("/dashboard/bot");

  const cargar = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    setViewerBase(session.user.id === ADMIN_USER_ID ? "/admin/telegram" : "/dashboard/bot");
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

  // Informe VINCULADO entre admin y Yaiza: es el mismo informe compartido, así que
  // refrescamos en silencio cada 30s y al volver a la pestaña. Si uno pulsa
  // "Actualizar ahora", al otro se le actualiza solo (sin recargar la página).
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState === "visible") cargar();
    };
    document.addEventListener("visibilitychange", refrescar);
    const id = setInterval(refrescar, 30_000);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refrescar);
    };
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

  // Aprobar / descartar / sustituir una solución del banco (Adenda 1).
  async function accionSolucion(id: number, accion: string, sustituye_a?: number) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    await fetch("/api/admin/soluciones", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ id, accion, sustituye_a }),
    });
    await cargar();
  }

  const inf = resp?.informe;
  const d = inf?.datos;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
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

      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}
      {error && !cargando && <p className="text-sm text-rose-300">{error}</p>}

      {!cargando && !error && !inf && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
          Aún no hay ningún informe.{" "}
          {resp?.clasificadas_total
            ? `Ya hay ${resp.clasificadas_total} conversaciones clasificadas; el primer informe saldrá en el próximo ciclo.`
            : "Se generará automáticamente cuando haya conversaciones cerradas que analizar."}
          {" Puedes pulsar «Actualizar ahora» para generarlo ya."}
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
              base={viewerBase}
            />
          )}

          {/* Fricciones */}
          {d.ejemplos_friccion?.length > 0 && (
            <ListaEjemplos
              titulo="Se cortaron por un fallo técnico"
              color="amber"
              items={d.ejemplos_friccion}
              base={viewerBase}
            />
          )}

          {/* Adenda 2: decepción explícita con el bot */}
          {(d.ejemplos_decepcion?.length ?? 0) > 0 && (
            <ListaEjemplos
              titulo={`Se quejaron del bot (${d.decepciones ?? 0})`}
              color="rose"
              items={d.ejemplos_decepcion ?? []}
              base={viewerBase}
            />
          )}

          {/* Adenda 1: soluciones detectadas pendientes de aprobar */}
          {(d.soluciones_pendientes?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">
                Soluciones detectadas — pendientes de aprobar
              </h3>
              <p className="text-xs text-slate-500 mb-2">
                Si la apruebas, el bot podrá usarla con otros jugadores que tengan el mismo problema.
              </p>
              <div className="flex flex-col gap-2">
                {(d.soluciones_pendientes ?? []).map((s) => (
                  <SolucionCard
                    key={s.id}
                    s={s}
                    base={viewerBase}
                    onAccion={accionSolucion}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Adenda 1: soluciones aprobadas reutilizadas en el periodo */}
          {(d.soluciones_reutilizadas?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">
                Soluciones reutilizadas este periodo
              </h3>
              <div className="flex flex-col gap-1.5">
                {(d.soluciones_reutilizadas ?? []).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-black/20 px-3 py-2"
                  >
                    <span className="text-xs text-slate-300 flex-1 min-w-0 truncate">{s.problema}</span>
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                      usada {s.veces}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
  base,
}: {
  titulo: string;
  color: "rose" | "amber";
  items: Ejemplo[];
  base: string;
}) {
  const borde = color === "rose" ? "border-rose-400/30" : "border-amber-400/30";
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-300 mb-2">{titulo}</h3>
      <div className="flex flex-col gap-2">
        {items.slice(0, 8).map((e, i) => {
          const contenido = (
            <>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-medium text-slate-300">
                  {NOMBRE_BOT[e.bot] || e.bot}
                </span>
                {e.tipo && (
                  <span className="text-[11px] text-slate-500">· {NOMBRE_DUDA[e.tipo] || e.tipo}</span>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-snug">{e.resumen}</p>
              {e.chat_id != null && (
                <span
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-sky-400/40
                  bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-200"
                >
                  💬 Ver la conversación →
                </span>
              )}
            </>
          );
          const clase = `block rounded-lg border ${borde} bg-black/20 px-3 py-2`;
          return e.chat_id != null ? (
            <Link
              key={i}
              href={`${base}?bot=${encodeURIComponent(e.bot)}&chat=${e.chat_id}`}
              className={`${clase} hover:border-sky-400/60 hover:bg-white/5 transition-colors`}
            >
              {contenido}
            </Link>
          ) : (
            <div key={i} className={clase}>
              {contenido}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Una solución pendiente de aprobar: problema, solución, origen y botones de acción.
function SolucionCard({
  s,
  base,
  onAccion,
}: {
  s: SolucionPendiente;
  base: string;
  onAccion: (id: number, accion: string, sustituye_a?: number) => void;
}) {
  const [hecho, setHecho] = useState<string | null>(null);
  const act = (accion: string, sustituye_a?: number) => {
    setHecho(accion === "descartar" ? "Descartada" : "Aprobada");
    onAccion(s.id, accion, sustituye_a);
  };
  if (hecho) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
        {hecho} ✓
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-indigo-400/30 bg-black/20 px-3 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-medium text-slate-300">
          {s.bot ? NOMBRE_BOT[s.bot] || s.bot : "Común"}
        </span>
        {s.dup && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
            posible duplicado
          </span>
        )}
      </div>
      <p className="text-xs text-slate-300">
        <b className="text-slate-200">Problema:</b> {s.problema}
      </p>
      <p className="text-xs text-slate-400 mt-0.5">
        <b className="text-slate-200">Solución:</b> {s.solucion}
      </p>

      {s.dup && (
        <div className="mt-2 rounded-md border border-amber-400/20 bg-amber-500/5 px-2.5 py-2">
          <p className="text-[10px] text-amber-200/80 mb-0.5">Ya hay una aprobada parecida:</p>
          <p className="text-[11px] text-slate-400">
            <b className="text-slate-300">Sol. aprobada:</b> {s.dup.solucion}
          </p>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => act("aprobar")}
          className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1
          text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25"
        >
          Aprobar
        </button>
        {s.dup && (
          <button
            onClick={() => act("sustituir", s.dup!.id)}
            className="rounded-md border border-sky-400/40 bg-sky-500/15 px-2.5 py-1
            text-[11px] font-semibold text-sky-200 hover:bg-sky-500/25"
          >
            Sustituir a la aprobada
          </button>
        )}
        <button
          onClick={() => act("descartar")}
          className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1
          text-[11px] font-medium text-slate-300 hover:bg-white/10"
        >
          Descartar
        </button>
        {s.origen_bot && s.origen_chat_id != null && (
          <Link
            href={`${base}?bot=${encodeURIComponent(s.origen_bot)}&chat=${s.origen_chat_id}`}
            className="ml-auto text-[11px] font-semibold text-sky-300 hover:text-sky-200"
          >
            💬 Ver origen →
          </Link>
        )}
      </div>
    </div>
  );
}
