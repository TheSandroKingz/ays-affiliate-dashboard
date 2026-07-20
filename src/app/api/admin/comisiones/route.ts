import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, display_name, cpa_spain, cpa_other, subaffiliate_percent, wallet_erc20, wallet_trc20")
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ affiliates: data });
}

export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { affiliateId, cpaSpain, cpaOther, subaffiliatePercent } = body;

  if (!affiliateId) {
    return NextResponse.json({ error: "Falta affiliateId" }, { status: 400 });
  }

  // Validación de rangos: un CPA negativo o un % fuera de 0-100 rompería los
  // cálculos de margen/override. Aceptamos solo números dentro de límites sanos.
  const cpa = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100000;
  const pct = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

  if (!cpa(cpaSpain) || !cpa(cpaOther) || !pct(subaffiliatePercent)) {
    return NextResponse.json(
      { error: "Valores inválidos: CPA entre 0 y 100000, % entre 0 y 100." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update({
      cpa_spain: cpaSpain,
      cpa_other: cpaOther,
      subaffiliate_percent: subaffiliatePercent,
    })
    .eq("id", affiliateId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
