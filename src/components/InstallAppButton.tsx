"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

// Evento no estándar de instalación de PWA (Chrome/Android).
type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

// Botón "Instalar app" para el menú lateral.
// - Aparece en cualquier MÓVIL/TÁCTIL que no sea claramente un PC.
// - No aparece si ya está instalada (se abre en modo app) ni en escritorio.
// - En Android usa el instalador nativo si el navegador lo ofrece; si no (y en
//   iPhone), muestra las instrucciones para añadirla a la pantalla de inicio.
export default function InstallAppButton({ onNavigate }: { onNavigate?: () => void }) {
  const [deferred, setDeferred] = useState<PromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "otro">("otro");
  const [show, setShow] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const ua = nav.userAgent || "";

    // ¿Ya instalada? (se abre en modo app) → no mostrar.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true;

    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      // iPadOS 13+ se hace pasar por Mac: lo detectamos por el táctil.
      (nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1);
    const isAndroid = /android/i.test(ua);

    // "Es móvil/táctil y no un PC": por UA, o por puntero grueso (dedo) en
    // pantalla no enorme. Así aparece aunque el navegador no diga iOS/Android.
    const tactilPequeno =
      window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024;
    const esMovil =
      isIOS || isAndroid || /mobile/i.test(ua) || tactilPequeno;

    setPlatform(isIOS ? "ios" : isAndroid ? "android" : "otro");
    setShow(esMovil && !standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as PromptEvent);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      setDeferred(null);
      onNavigate?.();
    } else {
      setShowHelp((v) => !v);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-emerald-400 hover:bg-white/10 transition-colors"
      >
        <Download size={18} />
        Instalar app
      </button>
      {showHelp && (
        <div className="mx-2 mt-1 rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-slate-300 leading-relaxed">
          {platform === "ios" ? (
            <>
              En iPhone: pulsa{" "}
              <Share size={12} className="inline align-text-bottom text-emerald-400" />{" "}
              <b>Compartir</b> (abajo) y luego{" "}
              <b>&quot;Añadir a pantalla de inicio&quot;</b>.
            </>
          ) : platform === "android" ? (
            <>
              En Android: abre el menú <b>⋮</b> (arriba a la derecha) y pulsa{" "}
              <b>&quot;Instalar aplicación&quot;</b> o{" "}
              <b>&quot;Añadir a pantalla de inicio&quot;</b>.
            </>
          ) : (
            <>
              Abre el menú de tu navegador y busca{" "}
              <b>&quot;Instalar app&quot;</b> o{" "}
              <b>&quot;Añadir a pantalla de inicio&quot;</b>.
            </>
          )}
        </div>
      )}
    </div>
  );
}
