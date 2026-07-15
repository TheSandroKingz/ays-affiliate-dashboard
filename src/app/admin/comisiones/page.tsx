"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ComisionesClient from "@/components/admin/ComisionesClient";

const ADMIN_USER_ID = "a38a91c3-1f25-42df-ad5b-fbef6c09fee0";

type Affiliate = {
  id: string;
  display_name: string | null;
  cpa_spain: number | null;
  cpa_other: number | null;
  subaffiliate_percent: number | null;
};

export default function ComisionesPage() {
  const router = useRouter();
  const [affiliates, setAffiliates] = useState<Affiliate[] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || session.user.id !== ADMIN_USER_ID) {
        router.replace("/dashboard");
        return;
      }

      setAccessToken(session.access_token);

      const res = await fetch("/api/admin/comisiones", {
        headers: { Authorization: "Bearer " + session.access_token },
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Error al cargar");
        return;
      }

      setAffiliates(body.affiliates);
    }
    load();
  }, [router]);

  if (error) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Plan de Comisión por Afiliado</h1>
        <p style={{ color: "red" }}>Error: {error}</p>
      </main>
    );
  }

  if (!affiliates || !accessToken) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Plan de Comisión por Afiliado</h1>
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 32 }}>
      <h1 style={{ marginBottom: 24 }}>Plan de Comisión por Afiliado</h1>
      <ComisionesClient affiliates={affiliates} accessToken={accessToken} />
    </main>
  );
}
