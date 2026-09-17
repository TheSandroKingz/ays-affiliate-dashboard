"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import BotChatViewer, { type DineroBot } from "@/components/BotChatViewer";
import InformeAnalisis from "@/components/InformeAnalisis";
import { proximoPagoYaiza } from "@/lib/yaizaPago";

// Cómo va el bot hoy (sin dinero): respuestas, cuánto corrige el revisor y los
// mensajes que se quedaron sin contestar. Es lo que sirve para revisar los chats.
type EstadoBot = {
  respuestasHoy: number;
  sinContestarHoy?: number;
  revisor: { total: number; corrigio: number; sin_cambios: number; saltado: number; rechazado: number } | null;
  fallos: { bot: string | null; motivo: string; cuando: string }[];
};

export default function BotLectorPage() {
  const [dinero, setDinero] = useState<DineroBot | null>(null);
  const [estado, setEstado] = useState<EstadoBot | null>(null);
  const pago = proximoPagoYaiza();

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const r = await fetch("/api/bot/estado", {
          cache: "no-store",
          headers: { Authorization: "Bearer " + session.access_token },
        });
        if (r.ok) setEstado(await r.json());
      } catch {
        /* si falla, simplemente no se muestra */
      }
    })();
  }, []);

  return (
    <main className="flex flex-col gap-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-white">Conversaciones del bot</h1>
        <p className="text-sm text-slate-400 mt-1">
          Lee todas las charlas con los jugadores. Anota lo que veas para mejorarlo.
        </p>
      </div>

      {/* Tu próximo pago (500€/mes por revisar los chats) — intermedio, compacto. */}
      <div
        className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-4 ${
          pago.dias === 0 ? "border-amber-400/60 bg-amber-500/10" : "border-white/15 bg-white/5"
        }`}
      >
        <div className="min-w-0">
          <p className="text-xs text-slate-400">Tu próximo pago 💬</p>
          <p className="text-xl font-bold text-white leading-tight mt-0.5">
            {pago.dias === 0 ? "¡Hoy te toca cobrar!" : pago.fecha}
          </p>
        </div>
        <div className="text-right shrink-0 flex items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs ${
              pago.dias === 0 ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-slate-300"
            }`}
          >
            {pago.dias === 0 ? "hoy 🎉" : `faltan ${pago.dias}d`}
          </span>
          <p className={`text-2xl font-extrabold ${pago.dias === 0 ? "text-amber-300" : "text-emerald-300"}`}>
            {pago.importe}€
          </p>
        </div>
      </div>

      {/* Cómo va el bot HOY: lo que necesitas para revisar, sin cifras de dinero. */}
      {estado && (
        <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-slate-300">
            Respuestas hoy <b className="text-white">{estado.respuestasHoy}</b>
          </span>
          {estado.revisor && estado.revisor.total > 0 && (
            <span className="text-slate-300">
              El revisor corrigió{" "}
              <b className="text-white">
                {Math.round((estado.revisor.corrigio / estado.revisor.total) * 100)}%
              </b>{" "}
              <span className="text-slate-500">
                ({estado.revisor.corrigio} de {estado.revisor.total}; {estado.revisor.saltado} sin dar tiempo)
              </span>
            </span>
          )}
          <span className={estado.fallos.length > 0 ? "text-amber-300" : "text-slate-300"}>
            Sin contestar hoy <b className={estado.fallos.length > 0 ? "text-amber-200" : "text-white"}>{estado.sinContestarHoy ?? estado.fallos.length}</b>
            {estado.fallos.length > 0 && (
              <span className="text-slate-500"> · {estado.fallos[0].motivo}</span>
            )}
          </span>
        </div>
      )}

      {/* Lo que ha depositado la gente por el bot desde que empezó Yaiza. */}
      {dinero && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-5">
            <div className="text-sm text-emerald-200/80">
              💰 Depositado por los bots
            </div>
            <div className="mt-1 text-4xl font-extrabold text-emerald-300">
              {Math.round(dinero.total).toLocaleString("es-ES")} €
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Desde {new Date(dinero.desde + "T00:00:00").toLocaleDateString("es-ES")} · hoy:{" "}
              <b className="text-emerald-200">{Math.round(dinero.hoy).toLocaleString("es-ES")} €</b>
            </div>
          </div>
          <div className="rounded-2xl border border-sky-400/30 bg-gradient-to-br from-sky-500/20 to-sky-500/5 p-5">
            <div className="text-sm text-sky-200/80">🔁 Depósitos</div>
            <div className="mt-1 text-4xl font-extrabold text-sky-300">{dinero.veces}</div>
            <div className="mt-1 text-xs text-slate-400">
              hoy: <b className="text-sky-200">{dinero.vecesHoy}</b>
            </div>
          </div>
        </div>
      )}

      <BotChatViewer onDinero={setDinero} contadorTitulo />
    </main>
  );
}
