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

  // Parseo robusto del importe: aceptamos coma decimal europea ("123,45")
  // y, si llega algo no numérico o negativo, lo tratamos como 0 para NO
  // corromper (un null en SQL pondría la comisión a null).
  const rawAmount = (url.searchParams.get("commissionamount") ?? "0").trim();
  const normalized =
    rawAmount.includes(",") && !rawAmount.includes(".")
      ? rawAmount.replace(",", ".")
      : rawAmount;
  const parsed = Number(normalized);
  const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // Total de freshbet (tu red completa): la comisión de este evento se suma
  // a tu total del inicio, haya afiliado emparejado o no.
  await supabaseAdmin.rpc("increment_freshbet_daily", {
    p_date: today,
    p_commission: amount,
  });

  // Atribución al afiliado concreto (por trackingcode y, si no, por afp).
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

  if (target) {
    await supabaseAdmin.rpc("increment_daily_stats", {
      p_user_id: target.user_id,
      p_date: today,
      p_registrations: 0,
      p_ftd: 0,
      p_commission: amount,
    });
  }

  return NextResponse.json({ ok: true, matched: !!target });
}
