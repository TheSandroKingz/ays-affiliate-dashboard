import { NextResponse } from "next/server";
import { getPlayerId, registrarEvento, queryLimpia } from "@/lib/postback";

// Modelo actual: los afiliados cobran SOLO CPA (postback de FTD) y tú te quedas
// el margen (tu CPA − el suyo), que se calcula a partir de los FTD. La comisión
// que manda freshbet NO se usa para nada aquí, así que este postback solo
// responde OK (para que freshbet no reciba errores) sin sumar nada. Aun así lo
// dejamos registrado en la caja negra para tener el historial completo.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!process.env.POSTBACK_SECRET || key !== process.env.POSTBACK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await registrarEvento({
    event_type: "commission",
    raw_query: queryLimpia(url),
    tracking_code: url.searchParams.get("trackingcode") ?? "",
    afp: url.searchParams.get("afp") ?? "",
    player_id: getPlayerId(url),
    isocountry: (url.searchParams.get("isocountry") ?? "").toUpperCase(),
    matched_user_id: null,
    status: "no_match",
  });

  return NextResponse.json({ ok: true });
}
