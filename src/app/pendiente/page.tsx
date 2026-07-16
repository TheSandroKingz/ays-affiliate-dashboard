"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

export default function PendientePage() {
  const router = useRouter();

  // Si ya está aprobado (o cierra sesión), lo mandamos donde toque.
  useEffect(() => {
    async function check() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/login");
          return;
        }
        const { data: aff } = await supabase
          .from("affiliates")
          .select("approved")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (aff && aff.approved === true) router.replace("/dashboard");
      } catch {
        // Fallo transitorio: se queda en esta pantalla, sin romperse.
      }
    }
    check();
  }, [router]);

  async function salir() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <Image src="/logo.png" alt="A&S Afiliados" width={220} height={108} priority />
        </div>
        <div className="animate-in bg-white/10 backdrop-blur-lg border border-emerald-400/50 rounded-2xl p-8 shadow-[0_0_20px_rgba(16,185,129,0.6),0_0_45px_rgba(16,185,129,0.35),0_0_80px_rgba(16,185,129,0.15)]">
          <h1 className="text-2xl font-semibold text-white mb-3">
            Cuenta pendiente de aprobación
          </h1>
          <p className="text-slate-300 text-sm mb-6">
            Tu registro se ha recibido correctamente. Un administrador revisará tu
            cuenta y podrás acceder en cuanto la apruebe. ¡Gracias por tu paciencia!
          </p>
          <button
            onClick={salir}
            className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </main>
  );
}
