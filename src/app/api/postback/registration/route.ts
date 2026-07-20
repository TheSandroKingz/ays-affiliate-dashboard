import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getPlayerId,
  reclamarEvento,
  liberarEvento,
  registrarEvento,
  queryLimpia,
  type EstadoEvento,
} from "@/lib/postback";
import { notificarEvento } from "@/lib/push";

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
      .limit(1);
    targetUserId = data?.[0]?.user_id ?? null;
  }

  if (!targetUserId && afp) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id")
      .eq("freshaffs_affiliate_id", afp)
      .limit(1);
    targetUserId = data?.[0]?.user_id ?? null;
  }

  // Idempotencia: solo dentro de la rama con afiliado emparejado (para no quemar
  // el token en una entrega no atribuida). Reclamamos, contamos, y si el conteo
  // falla, liberamos para que un reintento de freshbet lo cuente.
  let duplicado = false;
  let estado: EstadoEvento = "no_match";
  if (targetUserId) {
    const eventKey = playerid ? `reg:${playerid}` : null;
    const contar = await reclamarEvento(eventKey);
    duplicado = !contar;
    if (contar) {
      const { error } = await supabaseAdmin.rpc("increment_daily_stats", {
        p_user_id: targetUserId,
        p_date: today,
        p_registrations: 1,
        p_ftd: 0,
        p_commission: 0,
      });
      if (error) {
        await liberarEvento(eventKey);
        estado = "error";
      } else {
        estado = "counted";
      }
    } else {
      estado = "duplicate";
    }
  }

  // Caja negra: guardamos el evento pase lo que pase (no bloquea la respuesta).
  await registrarEvento({
    event_type: "registration",
    raw_query: queryLimpia(url),
    tracking_code: trackingcode,
    afp,
    player_id: playerid,
    matched_user_id: targetUserId,
    status: estado,
  });

  // Notificación push al móvil (afiliado + admin), sin retrasar la respuesta.
  if (estado === "counted" && targetUserId) {
    after(() => notificarEvento(targetUserId, "registration"));
  }

  return NextResponse.json({ ok: true, matched: !!targetUserId, duplicado });
}
