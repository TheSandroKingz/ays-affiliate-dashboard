"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ComisionesClient from "@/components/admin/ComisionesClient";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { CardsSkeleton } from "@/components/Skeletons";

type Affiliate = {
  id: string;
  user_id: string;
  display_name: string | null;
  cpa_spain: number | null;
  cpa_other: number | null;
  subaffiliate_percent: number | null;
  wallet_erc20: string | null;
  wallet_trc20: string | null;
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
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-white">
          Plan de Comisión por Afiliado
        </h1>
        <p className="text-red-400">Error: {error}</p>
      </main>
    );
  }

  if (!affiliates || !accessToken) {
    return <CardsSkeleton title="Plan de Comisión por Afiliado" cards={4} />;
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-white">
        Plan de Comisión por Afiliado
      </h1>
      <ComisionesClient affiliates={affiliates} accessToken={accessToken} />
    </main>
  );
}
