"use client";

import { useRouter } from "next/navigation";

// Vuelve a la página anterior (al panel si venías de dentro), en vez de
// forzar ir a /login, que parecía cerrar la sesión.
export default function BackLink() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="inline-block text-sm text-emerald-400 hover:text-emerald-300 mb-6"
    >
      ← Volver
    </button>
  );
}
