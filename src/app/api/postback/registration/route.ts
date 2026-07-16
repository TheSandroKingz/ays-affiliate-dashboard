import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!process.env.POSTBACK_SECRET || key !== process.env.POSTBACK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const afp = url.searchParams.get("afp") ?? "";
  const trackingcode = url.searchParams.get("trackingcode") ?? "";

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // Atribución al afiliado concreto (para sus estadísticas), si lo identificamos.
  let targetUserId: string | null = null;

  if (trackingcode) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id")
      .eq("freshaffs_tracking_code", trackingcode)
      .maybeSingle();
    targetUserId = data?.user_id ?? null;
  }

  if (!targetUserId && afp) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id")
      .eq("freshaffs_affiliate_id", afp)
      .maybeSingle();
    targetUserId = data?.user_id ?? null;
  }

  if (targetUserId) {
    await supabaseAdmin.rpc("increment_daily_stats", {
      p_user_id: targetUserId,
      p_date: today,
      p_registrations: 1,
      p_ftd: 0,
      p_commission: 0,
    });
  }

  return NextResponse.json({ ok: true, matched: !!targetUserId });
}
