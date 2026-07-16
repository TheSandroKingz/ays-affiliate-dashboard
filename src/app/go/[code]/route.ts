import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getClientIp } from "@/lib/rateLimit";

// Bots y previsualizadores que abren el enlace para generar la vista previa
// (WhatsApp, Instagram, TikTok, Telegram, Facebook, etc.). Sus visitas NO son
// clics reales, así que redirigimos pero no las contamos.
const BOT_UA =
  /bot|crawl|spider|preview|whatsapp|facebookexternalhit|telegram|twitter|discord|slack|linkedin|pinterest|embed|scanner|fetch|curl|wget|headless|lighthouse|python-requests|bytespider|tiktok|musical_ly|instagram|snapchat|skype|line\/|vkshare|redditbot|googlebot|bingbot|yandex|applebot|metainspector|okhttp|dalvik/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  // Búsqueda insensible a mayúsculas (por si el enlace se comparte en otra caja).
  const { data: affiliate } = await supabaseAdmin
    .from("affiliates")
    .select("user_id, promo_link")
    .ilike("freshaffs_tracking_code", code.replace(/[%_]/g, "\\$&"))
    .maybeSingle();

  if (!affiliate || !affiliate.promo_link) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Defensa en profundidad: solo redirigimos a una URL https válida.
  let destino: URL;
  try {
    destino = new URL(affiliate.promo_link);
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (destino.protocol !== "https:") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // ¿Es un bot/preview o una precarga del navegador? Redirigimos sin contar.
  const ua = request.headers.get("user-agent") ?? "";
  const esBot = !ua || BOT_UA.test(ua);
  const esPrefetch =
    request.headers.get("sec-purpose")?.includes("prefetch") ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("x-purpose") === "preview" ||
    request.headers.get("x-moz") === "prefetch" ||
    !!request.headers.get("next-router-prefetch");

  if (!esBot && !esPrefetch) {
    const userId = affiliate.user_id;
    const ip = getClientIp(request);
    after(async () => {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Madrid",
      }).format(new Date());

      // Anti-duplicado: el mismo IP + mismo enlace en una ventana corta (~45s)
      // cuenta UNA sola vez. Evita el doble clic de los navegadores dentro de
      // apps (Instagram/TikTok cargan la página dos veces). Si la tabla de
      // deduplicación aún no existe, contamos igualmente (no perdemos clics).
      const bucket = Math.floor(Date.now() / 45000);
      const dedupKey = `${code.toLowerCase()}:${ip}:${bucket}`;
      const { data: inserted, error: dedupErr } = await supabaseAdmin
        .from("click_dedup")
        .upsert({ key: dedupKey }, { onConflict: "key", ignoreDuplicates: true })
        .select();

      const yaContado = !dedupErr && Array.isArray(inserted) && inserted.length === 0;
      if (!yaContado) {
        await supabaseAdmin.rpc("increment_daily_stats", {
          p_user_id: userId,
          p_date: today,
          p_clicks: 1,
        });
      }
    });
  }

  return NextResponse.redirect(destino.toString());
}
