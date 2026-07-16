import { NextResponse } from "next/server";

// Modelo actual: los afiliados cobran SOLO CPA (postback de FTD) y tú te quedas
// el margen (tu CPA − el suyo), que se calcula a partir de los FTD. La comisión
// que manda freshbet NO se usa para nada aquí, así que este postback solo
// responde OK (para que freshbet no reciba errores) sin escribir nada.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!process.env.POSTBACK_SECRET || key !== process.env.POSTBACK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
