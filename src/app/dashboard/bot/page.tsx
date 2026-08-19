"use client";

import { useState } from "react";
import BotChatViewer, { type DineroBot } from "@/components/BotChatViewer";
import { proximoPagoYaiza } from "@/lib/yaizaPago";

export default function BotLectorPage() {
  const [dinero, setDinero] = useState<DineroBot | null>(null);
  const pago = proximoPagoYaiza();

  return (
    <main className="flex flex-col gap-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-white">Conversaciones del bot</h1>
        <p className="text-sm text-slate-400 mt-1">
          Lee todas las charlas con los jugadores. Anota lo que veas para mejorarlo.
        </p>
      </div>

      {/* Tu próximo pago (500€/mes por revisar los chats). */}
      <div
        className={`rounded-2xl border p-5 flex items-center justify-between gap-4 ${
          pago.dias === 0 ? "border-amber-400/60 bg-amber-500/10" : "border-white/15 bg-white/5"
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm text-slate-400">Tu próximo pago</p>
          <p className="text-2xl font-bold text-white mt-0.5">
            {pago.dias === 0 ? "¡Hoy te toca cobrar!" : pago.fecha}
          </p>
          <p className="text-xs text-slate-500 mt-1">Cobras el 11 de cada mes por revisar los chats 💬</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-3xl font-extrabold ${pago.dias === 0 ? "text-amber-300" : "text-emerald-300"}`}>
            {pago.importe}€
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs ${
              pago.dias === 0 ? "bg-amber-400/20 text-amber-200" : "bg-white/10 text-slate-300"
            }`}
          >
            {pago.dias === 0 ? "hoy 🎉" : `faltan ${pago.dias} día${pago.dias === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {/* Lo que ha depositado la gente por el bot desde que empezó Yaiza. */}
      {dinero && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-5">
            <div className="text-sm text-emerald-200/80">
              💰 Han depositado por el bot desde que estás
            </div>
            <div className="mt-1 text-4xl font-extrabold text-emerald-300">
              {Math.round(dinero.total).toLocaleString("es-ES")} €
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Desde el {new Date(dinero.desde + "T00:00:00").toLocaleDateString("es-ES")} · hoy:{" "}
              <b className="text-emerald-200">{Math.round(dinero.hoy).toLocaleString("es-ES")} €</b>
            </div>
          </div>
          <div className="rounded-2xl border border-sky-400/30 bg-gradient-to-br from-sky-500/20 to-sky-500/5 p-5">
            <div className="text-sm text-sky-200/80">🔁 Veces que han depositado</div>
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
