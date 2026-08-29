"use client";

// Apartado propio del "Informe de análisis" (Fase 1b). Lo ven el admin y los
// gestores del bot (Yaiza). El admin además puede generarlo a mano.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { esGestorBot } from "@/lib/adminId";
import InformeAnalisis from "@/components/InformeAnalisis";

export default function AnalisisPage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  const comprobar = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid || !esGestorBot(uid)) {
      router.replace("/dashboard");
      return;
    }
    setOk(true);
  }, [router]);

  useEffect(() => {
    comprobar();
  }, [comprobar]);

  if (!ok) return null;

  return (
    <main className="flex flex-col gap-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-white">Informe de análisis</h1>
        <p className="text-sm text-slate-400 mt-1">
          Revisión de calidad de las charlas con los jugadores. Se genera solo cada 3 días.
        </p>
      </div>
      <InformeAnalisis />
    </main>
  );
}
