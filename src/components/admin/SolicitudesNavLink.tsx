"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchPending } from "@/lib/adminPending";

// Enlace "Solicitudes" con un contador de cuántas hay pendientes.
export default function SolicitudesNavLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetchPending().then((res) => setCount(res.pending.length));
  }, []);

  return (
    <Link
      href="/admin/solicitudes"
      className="text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
    >
      Solicitudes
      {count > 0 && (
        <span className="bg-amber-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">
          {count}
        </span>
      )}
    </Link>
  );
}
