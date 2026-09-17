import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getGestorBot } from "@/lib/adminAuth";

// Cómo va el bot HOY, para quien revisa las conversaciones (Yaiza) y para el admin.
// SIN dinero: cuántas respuestas lleva, cuánto corrige el revisor y cuántos
// mensajes se quedaron sin contestar. El coste en € es cosa del admin.
export async function GET(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const offMadrid = Number(
    (
      new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? "GMT+0"
    ).match(/GMT([+-]\d+)/)?.[1] ?? "0"
  );
  const inicioHoy = new Date(Date.parse(hoy + "T00:00:00Z") - offMadrid * 3600_000).toISOString();

  const [respuestas, revisor, fallos] = await Promise.all([
    supabaseAdmin
      .from("ia_uso")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "respuesta")
      .gte("created_at", inicioHoy),
    supabaseAdmin
      .from("revisor_daily")
      .select("total, corrigio, sin_cambios, saltado, rechazado")
      .eq("day", hoy)
      .maybeSingle(),
    supabaseAdmin
      .from("ia_fallos")
      .select("bot, motivo, created_at")
      .gte("created_at", inicioHoy)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    respuestasHoy: respuestas.count ?? 0,
    revisor: revisor.data ?? null,
    fallos: (fallos.data ?? []).map((f) => ({ bot: f.bot, motivo: f.motivo, cuando: f.created_at })),
  });
}
