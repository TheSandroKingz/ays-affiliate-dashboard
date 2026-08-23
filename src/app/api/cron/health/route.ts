import { NextResponse } from "next/server";
import { compararSecreto } from "@/lib/secreto";
import { revisarSaludBots } from "@/lib/botHealth";

export const dynamic = "force-dynamic";

// Chequeo de salud de los bots BAJO DEMANDA (para probarlo a mano). En marcha
// normal se ejecuta solo, enganchado al cron del mensaje diario (que corre varias
// veces al día), sin depender de un cron propio (el plan gratis de Vercel no
// admite crons frecuentes). Protegido por CRON_SECRET.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!compararSecreto(authHeader?.replace("Bearer ", ""), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const resultado = await revisarSaludBots();
  return NextResponse.json(resultado);
}
