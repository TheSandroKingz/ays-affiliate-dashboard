"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  pushSoportado,
  activarPush,
  desactivarPush,
  probarPush,
  registrarSW,
} from "@/lib/pushClient";

// Toggle "Notificaciones en el móvil". Al activarlo, este dispositivo recibirá
// un aviso cuando haya un nuevo registro o FTD. En iPhone hace falta tener la
// web instalada como app (Añadir a pantalla de inicio).
export default function PushToggle() {
  const [soportado, setSoportado] = useState(true);
  const [activo, setActivo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [denegado, setDenegado] = useState(false);
  const [probando, setProbando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSoportado()) {
      setSoportado(false);
      return;
    }
    setDenegado(Notification.permission === "denied");
    (async () => {
      await registrarSW();
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setActivo(!!sub && Notification.permission === "granted");
      } catch {
        /* nada */
      }
    })();
  }, []);

  if (!soportado) {
    return (
      <p className="text-xs text-slate-500">
        Este navegador no admite notificaciones. En iPhone, instala la app
        (Compartir → Añadir a pantalla de inicio) y actívalas desde ahí.
      </p>
    );
  }

  const toggle = async () => {
    setCargando(true);
    setAviso(null);
    try {
      if (activo) {
        await desactivarPush();
        setActivo(false);
      } else {
        const ok = await activarPush();
        setActivo(ok);
        if (!ok) setDenegado(Notification.permission === "denied");
      }
    } finally {
      setCargando(false);
    }
  };

  // Manda un aviso de prueba y comprueba si este dispositivo sigue suscrito.
  const probar = async () => {
    setProbando(true);
    setAviso(null);
    try {
      // Refrescamos la suscripción antes de probar: iPhone rota el endpoint y el
      // viejo queda muerto; así el aviso llega al que de verdad está activo.
      if (Notification.permission === "granted") await activarPush();
      const { ok, subs } = await probarPush();
      if (!ok) {
        setAviso("No se pudo enviar la prueba. Reintenta en un momento.");
      } else if (subs === 0) {
        setAviso(
          "No tienes ningún dispositivo suscrito. Activa las notificaciones (el botón de arriba) y vuelve a probar."
        );
      } else {
        setAviso(
          `Prueba enviada a ${subs} dispositivo${subs === 1 ? "" : "s"} 🔔 Revisa tu móvil en unos segundos.`
        );
      }
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={toggle}
        disabled={cargando || denegado}
        className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition ${
          activo
            ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
            : "border-white/15 bg-white/5 text-white hover:bg-white/10"
        } disabled:opacity-60`}
      >
        <span className="flex items-center gap-3">
          {activo ? <Bell size={18} /> : <BellOff size={18} />}
          {activo
            ? "Notificaciones activadas"
            : cargando
            ? "Activando..."
            : "Activar notificaciones"}
        </span>
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
            activo ? "bg-emerald-500" : "bg-white/20"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
              activo ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
      {activo && (
        <button
          onClick={probar}
          disabled={probando}
          className="self-start rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-60"
        >
          {probando ? "Enviando prueba..." : "🔔 Probar notificación"}
        </button>
      )}
      {aviso && <p className="text-xs text-emerald-300/90">{aviso}</p>}
      {denegado && (
        <p className="text-xs text-amber-300/90">
          Has bloqueado las notificaciones. Actívalas en los ajustes del
          navegador/app para este sitio.
        </p>
      )}
      <p className="text-xs text-slate-500">
        Te avisamos en este dispositivo cuando haya un nuevo registro o FTD. En
        iPhone hace falta abrir la app instalada.
      </p>
    </div>
  );
}
