import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";

// ACTIVIDAD DEL AFILIADO: sus propios registros y FTD cualificados según van
// entrando. Es la versión suya de /admin/actividad. Sirve para que vea caer lo
// que trae y pueda comprobar él mismo que su enlace cuenta bien.
//
// ⛔ NADA del jugador: ni su id, ni cuánto depositó, ni el estado interno del
// evento (retenido, duplicado, revisión antifraude).
// Solo se enseña lo que CUENTA en su panel: registros contados y QFTD contados
// (los que cobra). Fuera a propósito los primeros depósitos que aún no han
// cualificado y las recargas: harían preguntar "¿y este por qué no me paga?".
export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("cpa_spain, cpa_other")
    .eq("user_id", user.id)
    .maybeSingle();
  const cpaEspana = Number(aff?.cpa_spain ?? 0);
  const cpaOtros = Number(aff?.cpa_other ?? aff?.cpa_spain ?? 0);

  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data, error } = await supabaseAdmin
    .from("postback_events")
    .select("id, created_at, event_type, counted, status, isocountry, afp")
    .eq("matched_user_id", user.id)
    .in("event_type", ["registration", "commission"])
    .eq("counted", true)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });

  const eventos = (data ?? [])
    .filter((e) => e.status !== "duplicate")
    .map((e) => {
      const pais = String(e.isocountry ?? "").toUpperCase() || null;
      const cualificado = e.event_type === "commission";
      return {
        id: e.id as number,
        fecha: e.created_at as string,
        tipo: cualificado ? "ftd" : "registro",
        pais,
        // Mismo criterio que el postback al sumarle el CPA: fuera de España usa
        // su cpa_other. (Hoy todos tienen los dos iguales.) Es su CPA ACTUAL: si
        // algún día se le cambia, lo antiguo se verá con el nuevo.
        ganado: cualificado ? (pais && pais !== "ES" ? cpaOtros : cpaEspana) : null,
        porBot: String(e.afp ?? "").startsWith("bot"),
      };
    });

  return NextResponse.json({ eventos });
}
