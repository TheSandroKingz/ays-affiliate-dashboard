import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlayerId, getMonto, registrarEvento, queryLimpia } from "@/lib/postback";

// Postback de FTD = CUALQUIER primer depósito (aunque no cualifique). FreshBet
// lo manda "for each new first time deposit". NO suma dinero: el pago va por el
// QFTD (postback de comisión = depósito cualificado). Aquí solo dejamos
// constancia del depósito en la caja negra (status "deposit"), que además sirve
// de prueba de que ese jugador depositó (lo exige el QFTD para poder contar).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!process.env.POSTBACK_SECRET || key !== process.env.POSTBACK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const afp = url.searchParams.get("afp") ?? "";
  const trackingcode = url.searchParams.get("trackingcode") ?? "";
  const isocountry = (url.searchParams.get("isocountry") ?? "").toUpperCase();
  const playerid = getPlayerId(url);
  const monto = getMonto(url);

  // Atribución (solo para el registro; no suma nada).
  let matchedUserId: string | null = null;
  if (trackingcode) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id")
      .ilike("freshaffs_tracking_code", trackingcode.replace(/[%_]/g, "\\$&"))
      .limit(1);
    matchedUserId = data?.[0]?.user_id ?? null;
  }
  if (!matchedUserId && afp) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id")
      .eq("freshaffs_affiliate_id", afp)
      .limit(1);
    matchedUserId = data?.[0]?.user_id ?? null;
  }

  await registrarEvento({
    event_type: "ftd",
    raw_query: queryLimpia(url),
    tracking_code: trackingcode,
    afp,
    player_id: playerid,
    isocountry,
    matched_user_id: matchedUserId,
    amount: monto,
    status: "deposit", // depósito recibido, no cualificado → no suma dinero
  });

  return NextResponse.json({ ok: true, matched: !!matchedUserId, counted: false });
}
