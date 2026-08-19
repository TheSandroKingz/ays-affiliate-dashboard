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

      {/* Tu próximo pago (500€/mes por revisar los chats) — compacto, en una línea. */}
      <div
        className={`rounded-xl border px-4 py-2.5 flex items-center gap-2.5 text-sm ${
          pago.dias === 0 ? "border-amber-400/50 bg-amber-500/10" : "border-white/10 bg-white/5"
        }`}
      >
        <span className="text-base">💶</span>
        <span className="text-slate-400">Tu próximo pago</span>
        <span className={`font-extrabold text-base ${pago.dias === 0 ? "text-amber-300" : "text-emerald-300"}`}>
          {pago.importe}€
        </span>
        <span className="text-slate-500 truncate">· {pago.dias === 0 ? "¡hoy toca!" : pago.fecha}</span>
        {pago.dias > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">
            faltan {pago.dias}d
          </span>
        )}
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
