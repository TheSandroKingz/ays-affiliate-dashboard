"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_USER_ID = "a38a91c3-1f25-42df-ad5b-fbef6c09fee0";

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
        return;
      }

      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Error al cargar");
        setLoaded(true);
        return;
      }

      setStats(body.stats);
      setLoaded(true);
    }
    load();
  }, [router]);

  if (!loaded) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Dashboard de Afiliados</h1>
        <p>Cargando...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Dashboard de Afiliados</h1>
        <p style={{ color: "red" }}>Error: {error}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>Dashboard de Afiliados</h1>
      {(!stats || stats.length === 0) ? (
        <p>Todavía no hay estadísticas cargadas.</p>
      ) : (
        <table border={1} cellPadding={8}>
          <thead>
            <tr>
              <th>Afiliado</th>
              <th>Fecha</th>
              <th>Clicks</th>
              <th>Leads</th>
              <th>Depósitos</th>
              <th>Comisión</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row: any) => (
              <tr key={row.id}>
                <td>{row.affiliates?.display_name ?? "-"}</td>
                <td>{row.stat_date}</td>
                <td>{row.clicks_total}</td>
                <td>{row.leads_total}</td>
                <td>{row.deposits_total}</td>
                <td>{row.commission_total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
