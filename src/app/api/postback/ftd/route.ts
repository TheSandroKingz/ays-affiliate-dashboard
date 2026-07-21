import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getPlayerId,
  getMonto,
  reclamarEvento,
  liberarEvento,
  registrarEvento,
  ftdYaContado,
  queryLimpia,
  type EstadoEvento,
} from "@/lib/postback";
import { notificarEvento, enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";

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
  const monto = getMonto(url); // importe del depósito (0 si freshbet no lo manda)

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
      // Salvaguarda extra: aunque el candado diga "nuevo", si este jugador YA
      // tenía un FTD CONTADO, NO sumamos el dinero. Lo dejamos RETENIDO para que
      // el admin lo revise (contar o descartar). Así un doble pago es imposible
      // aunque el candado fallara. NO liberamos el candado: si quedó reclamado,
      // evita más retenidos por reenvíos del mismo FTD.
      const yaContado = playerid ? await ftdYaContado(playerid) : false;
      if (yaContado) {
        estado = "held";
      } else {
        // Todo FTD emparejado (por trackingcode o por afp) acredita el CPA del
        // afiliado dueño de ese código/afp. Así tu propio tráfico (afp) también
        // cuenta como tu comisión, igual que el de tus afiliados.
        // País desconocido (isocountry vacío) → tarifa de España por defecto
        // (casino español), no la de "otros países".
        const esOtroPais = isocountry && isocountry !== "ES";
        const commission = Number(
          (esOtroPais ? target.cpa_other : target.cpa_spain) ?? 0
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
    amount: monto,
    status: estado,
  });

  // Notificación push al móvil (afiliado + admin), sin retrasar la respuesta.
  if (estado === "counted" && target) {
    after(() => notificarEvento(target.user_id, "ftd"));
  }
  // Si quedó RETENIDO por sospecha, avisamos al admin para que lo revise ya.
  if (estado === "held") {
    after(() =>
      enviarPush(ADMIN_USER_ID, {
        title: "⚠️ FTD retenido",
        body: "Un FTD quedó sin contar por sospecha de doble pago. Revísalo en Actividad.",
        url: "/admin/actividad",
      })
    );
  }

  return NextResponse.json({ ok: true, matched: !!target, duplicado });
}
