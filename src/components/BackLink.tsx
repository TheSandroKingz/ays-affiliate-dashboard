"use client";

import { useRouter } from "next/navigation";

// Vuelve a la página anterior (al panel si venías de dentro), en vez de
// forzar ir a /login, que parecía cerrar la sesión.
export default function BackLink() {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        // Si hay historial (misma pestaña), volver; si se abrió en pestaña
        // nueva (sin historial), ir al panel en vez de dejar el botón inerte.
        if (window.history.length > 1) router.back();
        else router.push("/dashboard");
      }}
      className="inline-block text-sm text-emerald-400 hover:text-emerald-300 mb-6"
    >
      ← Volver
    </button>
  );
}
