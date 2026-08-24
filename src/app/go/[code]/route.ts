import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getClientIp } from "@/lib/rateLimit";

// Bots/previsualizadores que abren el enlace para generar la vista previa
// (viven en servidores de la plataforma, NO son clics reales). OJO: NO metemos
// "instagram"/"tiktok" porque el navegador DENTRO de esas apps sí es un usuario
// real; su doble carga la resuelve el anti-duplicado por IP.
const BOT_UA =
  /bot\b|crawl|spider|preview|whatsapp|facebookexternalhit|telegrambot|twitterbot|discordbot|slackbot|linkedinbot|pinterest|embedly|scanner|curl|wget|headless|lighthouse|python-requests|bytespider|vkshare|redditbot|googlebot|bingbot|yandex|applebot|metainspector|whatsapp/i;

// Caché en memoria del enlace por código (el promo_link casi nunca cambia).
// Así el visitante redirige al instante sin esperar a la BD en cada clic.
type CacheEntry = { user_id: string; promo_link: string } | null;
const linkCache = new Map<string, { value: CacheEntry; exp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getAffiliate(code: string): Promise<CacheEntry> {
  const key = code.toLowerCase();
  const now = Date.now();
  const hit = linkCache.get(key);
  if (hit && hit.exp > now) return hit.value;

  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("user_id, promo_link")
    .ilike("freshaffs_tracking_code", code.replace(/[\\%_*]/g, "\\$&"))
    .limit(1);
  const aff = data?.[0];
  const value: CacheEntry =
    aff && aff.promo_link ? { user_id: aff.user_id, promo_link: aff.promo_link } : null;
  // Poda: tope de tamaño para que enumerar códigos aleatorios (cada uno una clave
  // nueva) NO haga crecer el Map sin límite (fuga de memoria en la Lambda).
  if (linkCache.size > 2000) {
    const oldest = linkCache.keys().next().value;
    if (oldest !== undefined) linkCache.delete(oldest);
  }
  linkCache.set(key, { value, exp: now + CACHE_TTL });
  return value;
}

// ── Códigos DEDICADOS de los BOTS de Telegram. Antes el botón del bot iba DIRECTO
// a celsius (no contaba clicks). Ahora pasa por /go para CONTAR el click, pero el
// destino sigue siendo el MISMO enlace de celsius del bot: mismo código de campaña
// ⇒ el postback de Blue atribuye IGUAL la comisión (no se toca el dinero). El
// destino va FIJO aquí: aunque la BD falle, /go SIEMPRE redirige a celsius y NUNCA
// deja tirado al jugador (no se pierde ningún QFTD). `dueno` = tracking del afiliado
// al que se le suma el CLICK (solo el conteo; el dinero lo resuelve el postback).
const BOT_LINKS: Record<string, { destino: string; dueno: string }> = {
  ymijpivpyx: { destino: "https://celsius.games/YmIjpivpyx", dueno: "Default" }, // BOT AS (Sandro) → casa/Mongolitos
  ishrdbxnke: { destino: "https://celsius.games/iSHRdbxNKE", dueno: "cZahjDgQoR" }, // BOT JEFFER → Jeffer
  whwahavgwx: { destino: "https://celsius.games/WHWAhAVgwx", dueno: "ecUGAqtfld" }, // BOT BLACK KP → Black KP
  nairiroica: { destino: "https://celsius.games/naIRiroIcA", dueno: "werECqYvPP" }, // BOT iAFRIKA → iAfrika
  // Mariam/Livana usa AhBpxgTaoP (su código personal = el del bot) → ya resuelve por
  // la vía de afiliado normal; no necesita entrada aquí.
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  // ¿Es el código dedicado de un BOT? Destino FIJO (celsius) y el click se atribuye
  // al afiliado dueño. Si no, es un enlace de afiliado normal (por su promo_link).
  const botLink = BOT_LINKS[code.toLowerCase()];
  let promoLink: string;
  let clickUserId: string | undefined;
  if (botLink) {
    promoLink = botLink.destino;
    const dueno = await getAffiliate(botLink.dueno); // solo para atribuir el click
    clickUserId = dueno?.user_id;
  } else {
    const affiliate = await getAffiliate(code);
    if (!affiliate || !affiliate.promo_link) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    promoLink = affiliate.promo_link;
    clickUserId = affiliate.user_id;
  }

  // Defensa en profundidad: solo redirigimos a una URL https válida.
  let destino: URL;
  try {
    destino = new URL(promoLink);
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (destino.protocol !== "https:") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  // Candado de host: SOLO redirigimos a Celsius/Blue. Si un promo_link quedara
  // apuntando al casino viejo (FreshBet/affision), NO mandamos ahí a la gente:
  // mejor a la home que a un casino muerto. Red de seguridad ante links rancios.
  const HOST_OK = /(^|\.)celsius\.games$|(^|\.)blue2affiliates\.com$/i;
  if (!HOST_OK.test(destino.hostname)) {
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

  if (!esBot && !esPrefetch && clickUserId) {
    const userId = clickUserId;
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
      const base = `${code.toLowerCase()}:${ip}`;
      const dedupKey = `${base}:${bucket}`;
      // Borde de ventana: si ya contamos en el bucket ANTERIOR (hace <45s), es el
      // mismo clic a caballo del cambio de bucket → no lo contamos dos veces.
      const { data: prevHit } = await supabaseAdmin
        .from("click_dedup")
        .select("key")
        .eq("key", `${base}:${bucket - 1}`)
        .maybeSingle();
      const { data: inserted, error: dedupErr } = await supabaseAdmin
        .from("click_dedup")
        .upsert({ key: dedupKey }, { onConflict: "key", ignoreDuplicates: true })
        .select();

      const yaContado =
        !!prevHit || (!dedupErr && Array.isArray(inserted) && inserted.length === 0);
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
