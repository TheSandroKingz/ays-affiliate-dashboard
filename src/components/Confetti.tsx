"use client";

import { useMemo } from "react";

// Confeti ligero (sin librerías): al montarse, esparce piezas de colores que
// caen girando y se van. Se renderiza solo cuando hay algo que celebrar.
const COLORES = ["#10b981", "#38bdf8", "#f59e0b", "#ef4444", "#a855f7", "#ffffff"];

export default function Confetti({ piezas = 40 }: { piezas?: number }) {
  // Posiciones/colores fijos por render (no dependen de Math.random en cada frame).
  const trozos = useMemo(
    () =>
      Array.from({ length: piezas }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        color: COLORES[i % COLORES.length],
        rot: Math.random() * 360,
      })),
    [piezas]
  );

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden" aria-hidden>
      {trozos.map((t, i) => (
        <span
          key={i}
          className="confetti-pieza"
          style={{
            left: `${t.left}%`,
            backgroundColor: t.color,
            animationDelay: `${t.delay}s`,
            animationDuration: `${t.duration}s`,
            transform: `rotate(${t.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
