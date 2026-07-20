import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notificarTelegram } from "@/lib/notify";
import {
  getPlayerId,
  reclamarEvento,
  liberarEvento,
  registrarEvento,
  queryLimpia,
  type EstadoEvento,
} from "@/lib/postback";

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

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // Atribución al afiliado concreto (para pagarle su CPA), si lo identificamos.
  let target: { user_id: string; cpa_spain: number | null; cpa_other: number | null } | null = null;

  if (trackingcode) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, cpa_spain, cpa_other")
      .ilike("freshaffs_tracking_code", trackingcode.replace(/[%_]/g, "\\$&"))
      .limit(1);
    if (data?.[0]) {
      target = data[0];
    }
  }

  if (!target && afp) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, cpa_spain, cpa_other")
      .eq("freshaffs_affiliate_id", afp)
      .limit(1);
    target = data?.[0] ?? null;
  }

  // Idempotencia: solo dentro de la rama con afiliado emparejado. Reclamamos,
  // pagamos el CPA, y si el conteo falla, liberamos para que un reintento cuente.
  let duplicado = false;
  let estado: EstadoEvento = "no_match";
  let comisionPagada = 0;
  if (target) {
    const eventKey = playerid ? `ftd:${playerid}` : null;
    const contar = await reclamarEvento(eventKey);
    duplicado = !contar;
    if (contar) {
      // Todo FTD emparejado (por trackingcode o por afp) acredita el CPA del
      // afiliado dueño de ese código/afp. Así tu propio tráfico (afp) también
      // cuenta como tu comisión, igual que el de tus afiliados.
      const commission = Number(
        (isocountry === "ES" ? target.cpa_spain : target.cpa_other) ?? 0
      );

      const { error } = await supabaseAdmin.rpc("increment_daily_stats", {
        p_user_id: target.user_id,
        p_date: today,
        p_registrations: 0,
        p_ftd: 1,
        p_commission: commission,
      });
      if (error) {
        await liberarEvento(eventKey);
        estado = "error";
      } else {
        estado = "counted";
        comisionPagada = commission;
      }
    } else {
      estado = "duplicate";
    }
  }

  // Caja negra: guardamos el evento pase lo que pase (no bloquea la respuesta).
  await registrarEvento({
    event_type: "ftd",
    raw_query: queryLimpia(url),
    tracking_code: trackingcode,
    afp,
    player_id: playerid,
    isocountry,
    matched_user_id: target?.user_id ?? null,
    commission: comisionPagada,
    status: estado,
  });

  // Alerta: un FTD contado SIN player_id no tiene candado anti-duplicados.
  // Avisamos por Telegram para poder revisar la config de freshbet a tiempo.
  if (estado === "counted" && !playerid) {
    after(() =>
      notificarTelegram(
        `⚠️ <b>FTD contado SIN player_id</b>\nTracking: <b>${trackingcode || "—"}</b> · CPA: ${comisionPagada}€\nEl anti-duplicados no puede protegerlo. Revisa que freshbet envíe el id de jugador.`
      )
    );
  }

  return NextResponse.json({ ok: true, matched: !!target, duplicado });
}
