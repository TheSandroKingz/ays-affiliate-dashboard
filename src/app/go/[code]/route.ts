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

  // Defensa en profundidad: solo redirigimos a una URL https válida.
  // Evita open-redirect a javascript:/data:/http si el enlace fuera manipulado.
  let destino: URL;
  try {
    destino = new URL(affiliate.promo_link);
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (destino.protocol !== "https:") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Contamos el clic del afiliado en segundo plano (after) para NO retrasar la
  // redirección del visitante. La fecha usa la zona de Madrid.
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

  return NextResponse.redirect(destino.toString());
}
