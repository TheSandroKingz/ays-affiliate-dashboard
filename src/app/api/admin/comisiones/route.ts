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
    .select("id, display_name, cpa_spain, cpa_other, subaffiliate_percent")
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
