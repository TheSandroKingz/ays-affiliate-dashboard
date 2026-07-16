import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlayerId, yaContado } from "@/lib/postback";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!process.env.POSTBACK_SECRET || key !== process.env.POSTBACK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const afp = url.searchParams.get("afp") ?? "";
  const trackingcode = url.searchParams.get("trackingcode") ?? "";
  const playerid = getPlayerId(url);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // Atribución al afiliado concreto (para sus estadísticas), si lo identificamos.
  // Búsqueda por trackingcode INSENSIBLE a mayúsculas (freshbet podría mandar
  // "fresh"/"FRESH"): usamos ilike escapando comodines.
  let targetUserId: string | null = null;

  if (trackingcode) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id")
      .ilike("freshaffs_tracking_code", trackingcode.replace(/[%_]/g, "\\$&"))
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

  // Idempotencia: un mismo jugador solo cuenta un registro (evita duplicados
  // si freshbet reintenta el postback). Si no llega playerid, se cuenta igual.
  const duplicado = await yaContado(playerid ? `reg:${playerid}` : null);

  if (targetUserId && !duplicado) {
    await supabaseAdmin.rpc("increment_daily_stats", {
      p_user_id: targetUserId,
      p_date: today,
      p_registrations: 1,
      p_ftd: 0,
      p_commission: 0,
    });
  }

  return NextResponse.json({ ok: true, matched: !!targetUserId, duplicado });
}
