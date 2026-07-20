"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

// Evento no estándar de instalación de PWA (Chrome/Android).
type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

// Botón "Instalar app" para el menú lateral.
// - Solo aparece en MÓVIL (iPhone/Android). En PC no se muestra.
// - Si ya está instalada (se abre en modo app), tampoco aparece.
// - En Android usa el instalador nativo si el navegador lo ofrece; si no,
//   muestra las instrucciones. En iPhone siempre muestra instrucciones
//   (Safari no permite instalar por código).
export default function InstallAppButton({ onNavigate }: { onNavigate?: () => void }) {
  const [deferred, setDeferred] = useState<PromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "other" | null>(null);
  const [installed, setInstalled] = useState(true); // oculto hasta comprobar
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const ua = nav.userAgent || "";
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true;
    setInstalled(standalone);
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    setPlatform(isIOS ? "ios" : isAndroid ? "android" : "other");

    // Chrome puede lanzar este evento muy pronto; lo capturamos si llega, pero
    // el botón NO depende de él (en Android caemos a instrucciones si no viene).
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

  // Ya instalada → nada. Y solo en móvil: en PC (o UA desconocida) no aparece.
  if (installed) return null;
  if (platform !== "ios" && platform !== "android") return null;

  const handleClick = async () => {
    if (deferred) {
      // Android con instalador nativo capturado: un toque y listo.
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
      {showHelp && (
        <div className="mx-2 mt-1 rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-slate-300 leading-relaxed">
          {platform === "ios" ? (
            <>
              En iPhone: pulsa{" "}
              <Share size={12} className="inline align-text-bottom text-emerald-400" />{" "}
              <b>Compartir</b> (abajo) y luego{" "}
              <b>&quot;Añadir a pantalla de inicio&quot;</b>.
            </>
          ) : (
            <>
              En Android: abre el menú <b>⋮</b> (arriba a la derecha) y pulsa{" "}
              <b>&quot;Instalar aplicación&quot;</b> o{" "}
              <b>&quot;Añadir a pantalla de inicio&quot;</b>.
            </>
          )}
        </div>
      )}
    </div>
  );
}
