import { after, NextResponse } from "next/server";
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

  // Contamos el clic en segundo plano (after) para NO retrasar la redirección
  // del visitante hacia la casa de apuestas. La fecha usa la zona de Madrid,
  // coherente con el resto de las estadísticas.
  const userId = affiliate.user_id;
  after(async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
    }).format(new Date());
    await supabaseAdmin.rpc("increment_daily_stats", {
      p_user_id: userId,
      p_date: today,
      p_clicks: 1,
    });
  });

  return NextResponse.redirect(affiliate.promo_link);
}
