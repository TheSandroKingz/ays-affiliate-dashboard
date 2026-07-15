import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const { data: affiliate } = await supabaseAdmin
    .from("affiliates")
    .select("user_id, promo_link")
    .eq("freshaffs_tracking_code", code)
    .single();

  if (!affiliate || !affiliate.promo_link) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const today = new Date().toISOString().slice(0, 10);

  await supabaseAdmin.rpc("increment_daily_stats", {
    p_user_id: affiliate.user_id,
    p_date: today,
    p_clicks: 1,
  });

  return NextResponse.redirect(affiliate.promo_link);
}
