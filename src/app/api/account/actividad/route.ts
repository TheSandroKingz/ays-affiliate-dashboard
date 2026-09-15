import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";

// ACTIVIDAD DEL AFILIADO: sus propios registros y FTD cualificados según van
// entrando. Es la versión suya de /admin/actividad.
//
// ⚠️ LOS TOTALES SALEN DE affiliate_daily_stats, LA MISMA FUENTE QUE SU PANEL.
// La primera versión los contaba desde postback_events y no cuadraba: a Jeffer
// le salían 74 FTD donde su panel decía 114 (tope de 300 filas) y, aun sin tope,
// faltaban 1-3 FTD y registros en Jeffer, Black KP y Mongolitos. Son los días
// 11-14 de septiembre, cuando se corrigieron a mano pagos perdidos y dobles
// pagos: el dinero del panel está bien, el que quedó incompleto es el registro
// de eventos. Así que los números vienen del panel y la lista es solo el detalle.
//
// ⛔ NADA del jugador: ni su id, ni cuánto depositó, ni el estado interno del
// evento (retenido, duplicado, revisión antifraude). En la lista solo va lo que
// cuenta: registros y QFTD contados. Fuera los primeros depósitos que aún no han
// cualificado y las recargas, que harían preguntar "¿y este por qué no me paga?".
const madrid = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const hoy = madrid(new Date());
  const inicioMes = hoy.slice(0, 7) + "-01";

  const [{ data: aff }, { data: stats, error: eStats }, { data: ev, error: eEv }] = await Promise.all([
    supabaseAdmin.from("affiliates").select("cpa_spain, cpa_other").eq("user_id", user.id).maybeSingle(),
    supabaseAdmin
      .from("affiliate_daily_stats")
      .select("date, registrations, ftd, commission")
      .eq("user_id", user.id)
      .gte("date", inicioMes)
      .order("date", { ascending: true }),
    supabaseAdmin
      .from("postback_events")
      .select("id, created_at, event_type, status, isocountry, afp")
      .eq("matched_user_id", user.id)
      .in("event_type", ["registration", "commission"])
      .eq("counted", true)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (eStats || eEv) return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });

  const suma = (filas: typeof stats) => ({
    registros: (filas ?? []).reduce((s, r) => s + Number(r.registrations ?? 0), 0),
    ftd: (filas ?? []).reduce((s, r) => s + Number(r.ftd ?? 0), 0),
    ganado: (filas ?? []).reduce((s, r) => s + Number(r.commission ?? 0), 0),
  });

  const cpaEspana = Number(aff?.cpa_spain ?? 0);
  const cpaOtros = Number(aff?.cpa_other ?? aff?.cpa_spain ?? 0);
  const eventos = (ev ?? [])
    .filter((e) => e.status !== "duplicate")
    .map((e) => {
      const pais = String(e.isocountry ?? "").toUpperCase() || null;
      const cualificado = e.event_type === "commission";
      return {
        id: e.id as number,
        fecha: e.created_at as string,
        tipo: cualificado ? "ftd" : "registro",
        pais,
        // Mismo criterio que el postback: fuera de España, su cpa_other.
        ganado: cualificado ? (pais && pais !== "ES" ? cpaOtros : cpaEspana) : null,
        porBot: String(e.afp ?? "").startsWith("bot"),
      };
    });

  return NextResponse.json({
    hoy: suma((stats ?? []).filter((r) => String(r.date).slice(0, 10) === hoy)),
    mes: suma(stats),
    eventos,
  });
}
