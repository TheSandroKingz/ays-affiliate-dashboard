"use client";

import { useEffect, useRef, useState } from "react";

// Anima un número desde su valor anterior hasta el nuevo (efecto "cuenta").
// La primera vez arranca desde 0. Respeta prefers-reduced-motion.
export default function CountUp({
  value,
  format,
  duration = 900,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  // Valor mostrado ahora mismo: para que un cambio a mitad de animación arranque
  // desde donde está (sin saltos).
  const displayRef = useRef(0);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (
      from === to ||
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const v = from + (to - from) * eased;
      displayRef.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(display)}</>;
}
