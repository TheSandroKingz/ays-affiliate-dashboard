"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

// Evento no estándar de instalación de PWA (Chrome/Android).
type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

// Botón "Instalar app" para el menú lateral. Aparece SOLO a quien puede
// instalarla: en Android/Chrome usa el diálogo nativo; en iPhone muestra las
// instrucciones (Safari no permite instalar por código). Si ya está instalada
// o el navegador no lo soporta, no se muestra nada.
export default function InstallAppButton({ onNavigate }: { onNavigate?: () => void }) {
  const [deferred, setDeferred] = useState<PromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(true); // asume instalada hasta comprobar
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true;
    setInstalled(standalone);
    setIsIOS(/iphone|ipad|ipod/i.test(nav.userAgent));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as PromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Ya instalada, o navegador sin soporte y no es iPhone → no mostramos nada.
  if (installed) return null;
  if (!deferred && !isIOS) return null;

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
        className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-emerald-400 hover:bg-white/10 transition-colors"
      >
        <Download size={18} />
        Instalar app
      </button>
      {showHelp && isIOS && (
        <div className="mx-2 mt-1 rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-slate-300 leading-relaxed">
          En iPhone: pulsa{" "}
          <Share size={12} className="inline align-text-bottom text-emerald-400" />{" "}
          <b>Compartir</b> abajo y luego{" "}
          <b>&quot;Añadir a pantalla de inicio&quot;</b>.
        </div>
      )}
    </div>
  );
}
