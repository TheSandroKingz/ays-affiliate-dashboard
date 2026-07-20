"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  // Guardián de acceso: sin sesión → login; cuenta NO aprobada → pendiente.
  useEffect(() => {
    async function check() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          router.replace("/login");
          return;
        }
        // ¿La cuenta está aprobada y tiene perfil? Si no (o está a medias) →
        // pantalla de pendiente. En error transitorio no bloqueamos (RLS protege).
        const { data: aff, error } = await supabase
          .from("affiliates")
          .select("approved")
          .eq("user_id", data.session.user.id)
          .maybeSingle();
        if (!error && (!aff || aff.approved !== true)) {
          router.replace("/pendiente");
          return;
        }
        setReady(true);
      } catch {
        // Ante cualquier fallo (red, Supabase lento), NO dejamos la pantalla en
        // blanco: mostramos el panel (los datos están protegidos por RLS igual).
        setReady(true);
      }
    }
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  return (
    <div className="flex min-h-screen bg-black">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0">
        <div className={`${sidebarOpen ? "hidden" : "flex"} md:hidden sticky top-0 z-30 bg-black/80 backdrop-blur border-b border-white/10 items-center px-4 py-3`}>
          <button onClick={() => setSidebarOpen(true)} aria-label="Abrir menú" className="text-white p-2 -ml-2">
            <Menu size={24} />
          </button>
          <span className="flex-1 flex justify-center pr-6">
            <Image src="/logo.png" alt="A&S Afiliados" width={120} height={59} priority />
          </span>
        </div>

        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8">{ready ? children : null}</main>
      </div>
    </div>
  );
}
