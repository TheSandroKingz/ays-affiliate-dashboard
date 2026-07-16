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
  const isocountry = (url.searchParams.get("isocountry") ?? "").toUpperCase();

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // Total de freshbet (tu red completa): contamos el FTD pase lo que pase.
  await supabaseAdmin.rpc("increment_freshbet_daily", {
    p_date: today,
    p_ftd: 1,
  });

  // Atribución al afiliado concreto (para pagarle su CPA), si lo identificamos.
  let target: { user_id: string; cpa_spain: number | null; cpa_other: number | null } | null = null;
  let isSubaffiliate = false;

  if (trackingcode) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, cpa_spain, cpa_other")
      .eq("freshaffs_tracking_code", trackingcode)
      .maybeSingle();
    if (data) {
      target = data;
      isSubaffiliate = true;
    }
  }

  if (!target && afp) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, cpa_spain, cpa_other")
      .eq("freshaffs_affiliate_id", afp)
      .maybeSingle();
    target = data;
  }

  if (target) {
    const commission = isSubaffiliate
      ? Number((isocountry === "ES" ? target.cpa_spain : target.cpa_other) ?? 0)
      : 0;

    await supabaseAdmin.rpc("increment_daily_stats", {
      p_user_id: target.user_id,
      p_date: today,
      p_registrations: 0,
      p_ftd: 1,
      p_commission: commission,
    });
  }

  return NextResponse.json({ ok: true, matched: !!target });
}
