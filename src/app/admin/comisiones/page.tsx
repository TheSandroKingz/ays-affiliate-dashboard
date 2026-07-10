import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ComisionesClient from "@/components/admin/ComisionesClient";

export const dynamic = "force-dynamic";

export default async function ComisionesPage() {
  const { data: affiliates, error } = await supabaseAdmin
    .from("affiliates")
    .select("id, display_name, cpa_spain, cpa_other, subaffiliate_percent")
    .order("display_name", { ascending: true });

  if (error) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Plan de Comisión por Afiliado</h1>
        <p style={{ color: "red" }}>Error: {error.message}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 32 }}>
      <h1 style={{ marginBottom: 24 }}>Plan de Comisión por Afiliado</h1>
      <ComisionesClient affiliates={affiliates ?? []} />
    </main>
  );
}