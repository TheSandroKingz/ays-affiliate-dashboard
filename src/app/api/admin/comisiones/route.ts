import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  const body = await request.json();
  const { affiliateId, cpaSpain, cpaOther, subaffiliatePercent } = body;

  if (!affiliateId) {
    return NextResponse.json({ error: "Falta affiliateId" }, { status: 400 });
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