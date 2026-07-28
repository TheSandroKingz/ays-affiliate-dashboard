import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlayerId, getMonto, registrarEvento, queryLimpia } from "@/lib/postback";

// Postback de DEPÓSITO/RECARGA = salta en CADA depósito (no solo el primero).
// Sirve para medir las RECARGAS que trae el bot (afp=bot), que el CPA no paga y
// que los otros postbacks (solo FTD) no ven. NO suma dinero: solo deja
// constancia en la caja negra (status "deposit", event_type "redeposit") con el
// importe y el afp, para poder ver la actividad recurrente y, si algún día hay
// RevShare, cuadrarla. BLINDADO: cualquier fallo se ignora, nunca rompe.
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

  // Atribución al afiliado (solo para el registro; no suma nada).
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
    event_type: "redeposit",
    raw_query: queryLimpia(url),
    tracking_code: trackingcode,
    afp,
    player_id: playerid,
    isocountry,
    matched_user_id: matchedUserId,
    amount: monto,
    status: "deposit", // recarga recibida, no suma dinero (el CPA va por el QFTD)
  });

  // Devolvemos lo recibido para poder VERIFICAR de un vistazo (que el macro del
  // importe y el afp llegan bien). No suma nada; es solo confirmación.
  return NextResponse.json({
    ok: true,
    recibido: { afp, importe: monto, player_id: playerid, pais: isocountry },
    matched: !!matchedUserId,
    counted: false,
  });
}
