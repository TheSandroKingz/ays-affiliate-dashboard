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
  const amount = Number(url.searchParams.get("commissionamount") ?? "0");

  // Igual que en registro/ftd: primero identificamos al afiliado por su
  // trackingcode (p. ej. "patron" / "A&S") y, si no, por el afp.
  let target: { user_id: string } | null = null;
  if (trackingcode) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id")
      .eq("freshaffs_tracking_code", trackingcode)
      .maybeSingle();
    target = data;
  }
  if (!target && afp) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id")
      .eq("freshaffs_affiliate_id", afp)
      .maybeSingle();
    target = data;
  }

  if (!target) {
    return NextResponse.json({ ok: false, reason: "no match" });
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  await supabaseAdmin.rpc("increment_daily_stats", {
    p_user_id: target.user_id,
    p_date: today,
    p_registrations: 0,
    p_ftd: 0,
    p_commission: amount,
  });

  return NextResponse.json({ ok: true });
}
