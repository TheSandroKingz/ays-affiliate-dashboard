"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { CardsSkeleton } from "@/components/Skeletons";

type Pending = { user_id: string; display_name: string | null };

export default function SolicitudesPage() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
        return;
      }
      setToken(session.access_token);
      const res = await fetch("/api/admin/pending", {
        headers: { Authorization: "Bearer " + session.access_token },
      })
        .then((r) => (r.ok ? r.json() : { pending: [] }))
        .catch(() => ({ pending: [] }));
      setPending(res.pending ?? []);
      setLoaded(true);
    }
    load();
  }, [router]);

  async function decidir(userId: string, action: "approve" | "reject") {
    if (!token) return;
    setBusyId(userId);
    const res = await fetch("/api/admin/pending", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ userId, action }),
    });
    setBusyId(null);
    if (res.ok) {
      setPending((prev) => prev.filter((p) => p.user_id !== userId));
    }
  }

  if (!loaded) {
    return <CardsSkeleton title="Solicitudes de registro" cards={2} />;
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-white">
          Solicitudes de registro
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Quien se registre aparece aquí. Nadie entra a su panel hasta que lo
          aceptes.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
          <p className="text-slate-400">
            No hay solicitudes pendientes ahora mismo.
          </p>
          <p className="text-slate-500 text-sm mt-1">
            Cuando alguien se registre, lo verás aquí para aceptarlo o rechazarlo.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-w-2xl">
          {pending.map((p) => (
            <div
              key={p.user_id}
              className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-400/30 rounded-xl px-4 py-3"
            >
              <span className="text-white font-medium truncate">
                {p.display_name ?? "—"}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => decidir(p.user_id, "approve")}
                  disabled={busyId === p.user_id}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  Aceptar
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `¿Rechazar a "${p.display_name ?? "este usuario"}"? Se BORRARÁ su cuenta y no se puede deshacer.`
                      )
                    ) {
                      decidir(p.user_id, "reject");
                    }
                  }}
                  disabled={busyId === p.user_id}
                  className="border border-red-400/40 text-red-300 hover:bg-red-500/10 disabled:opacity-60 text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
