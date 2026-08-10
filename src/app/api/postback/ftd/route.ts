import { NextResponse } from "next/server";
import { compararSecreto } from "@/lib/secreto";

// DESACTIVADO. FreshBet ya no trabaja con nosotros. Este endpoint solo recibía
// sus postbacks; ahora el casino activo es Celsius y entra por
// /api/postback/blue. Ignoramos los postbacks residuales de FreshBet para no
// ensuciar la caja negra ni contar dinero fantasma. Devolvemos 200 para que
// dejen de reintentar.
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!compararSecreto(key, process.env.POSTBACK_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ignored: "freshbet-legacy" });
}
