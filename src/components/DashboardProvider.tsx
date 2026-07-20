"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, MAX_SESSION_MS } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";

// Almacén compartido del panel: carga el perfil (nombre/avatar) UNA sola vez y
// hace de guardián de acceso (sin sesión → login; no aprobado → pendiente).
// Antes cada componente (Sidebar, panel, AdminDashboard) pedía el perfil por su
// cuenta (3-4 consultas repetidas). Ahora lo comparten desde aquí = más rápido.
type ProfileCtx = {
  ready: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

const Ctx = createContext<ProfileCtx>({
  ready: false,
  displayName: null,
  avatarUrl: null,
});

export const useProfile = () => useContext(Ctx);

export default function DashboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Guardián de acceso + carga del perfil (mismo comportamiento que antes).
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          router.replace("/login");
          return;
        }
        // Límite duro de sesión: a los 3 días se pide la contraseña de nuevo.
        const started = Number(localStorage.getItem("authStartAt") || 0);
        const now = Date.now();
        if (!started) {
          localStorage.setItem("authStartAt", String(now));
        } else if (now - started > MAX_SESSION_MS) {
          localStorage.removeItem("authStartAt");
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }
        const esAdmin = data.session.user.id === ADMIN_USER_ID;
        let aff: {
          approved?: boolean;
          display_name?: string | null;
          avatar_url?: string | null;
          active?: boolean;
        } | null = null;
        let error: unknown = null;
        {
          const r = await supabase
            .from("affiliates")
            .select("approved, display_name, avatar_url, active")
            .eq("user_id", data.session.user.id)
            .maybeSingle();
          aff = r.data;
          error = r.error;
          // Por si la columna 'active' aún no existe: reintenta sin ella.
          if (error) {
            const r2 = await supabase
              .from("affiliates")
              .select("approved, display_name, avatar_url")
              .eq("user_id", data.session.user.id)
              .maybeSingle();
            aff = r2.data;
            error = r2.error;
          }
        }
        if (!active) return;
        // Cuenta no aprobada, sin perfil o desactivada → pendiente. El admin
        // NUNCA se bloquea. En error transitorio no bloqueamos (RLS protege).
        if (
          !esAdmin &&
          !error &&
          (!aff || aff.approved !== true || aff.active === false)
        ) {
          router.replace("/pendiente");
          return;
        }
        setDisplayName(aff?.display_name ?? null);
        setAvatarUrl(aff?.avatar_url ?? null);
        setReady(true);
      } catch {
        // Ante cualquier fallo NO dejamos la pantalla en blanco.
        if (active) setReady(true);
      }
    }
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Al iniciar sesión (login real) reiniciamos el contador de 3 días.
      if (event === "SIGNED_IN") {
        localStorage.setItem("authStartAt", String(Date.now()));
      }
      if (!session) {
        localStorage.removeItem("authStartAt");
        router.replace("/login");
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  // El perfil puede cambiar en Configuración de Cuenta: nos actualizamos al
  // instante sin recargar (lo escuchan el Sidebar y demás vía este almacén).
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.display_name !== undefined) setDisplayName(d.display_name);
      if (d.avatar_url !== undefined) setAvatarUrl(d.avatar_url);
    };
    window.addEventListener("profile-updated", onUpdate);
    return () => window.removeEventListener("profile-updated", onUpdate);
  }, []);

  return (
    <Ctx.Provider value={{ ready, displayName, avatarUrl }}>
      {children}
    </Ctx.Provider>
  );
}
