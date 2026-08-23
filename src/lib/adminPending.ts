import { supabase } from "@/lib/supabaseClient";

// Petición COMPARTIDA a /api/admin/pending. El icono de notificaciones y el enlace
// "Solicitudes" piden lo mismo al cargar/navegar; con esta caché de promesa (TTL
// corto) COMPARTEN una sola petición en vez de duplicarla en cada navegación.
type Pending = { pending: { created_at: string }[] };
let cache: { at: number; p: Promise<Pending> } | null = null;
const TTL = 4000;

export function fetchPending(): Promise<Pending> {
  const now = Date.now();
  if (cache && now - cache.at < TTL) return cache.p;
  const p = (async (): Promise<Pending> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const t = session?.access_token;
      if (!t) return { pending: [] };
      const r = await fetch("/api/admin/pending", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + t },
      });
      const b = r.ok ? await r.json().catch(() => null) : null;
      return { pending: Array.isArray(b?.pending) ? b.pending : [] };
    } catch {
      return { pending: [] };
    }
  })();
  cache = { at: now, p };
  return p;
}
