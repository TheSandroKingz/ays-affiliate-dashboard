import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!process.env.POSTBACK_SECRET || key !== process.env.POSTBACK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

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

  // MODELO: los afiliados cobran SOLO CPA (que se suma en el postback de FTD).
  // La comisión que manda freshbet es TU ingreso, así que va únicamente a tu
  // total de la red (freshbet_daily), NUNCA al balance del afiliado. Así se
  // evita el doble pago (CPA + comisión) por un mismo jugador.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  await supabaseAdmin.rpc("increment_freshbet_daily", {
    p_date: today,
    p_commission: amount,
  });

  return NextResponse.json({ ok: true });
}
