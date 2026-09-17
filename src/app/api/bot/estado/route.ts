import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getGestorBot } from "@/lib/adminAuth";
import { tipoDeFallo } from "@/lib/iaUso";

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
    // Se traen los de hoy (son pocos) para poder separarlos por lo que pasó.
    supabaseAdmin
      .from("ia_fallos")
      .select("bot, motivo, created_at")
      .gte("created_at", inicioHoy)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  // Cada apunte, en su sitio: no es lo mismo "no le llegó nada" que "le llegó un
  // acuse" o "se frenó a propósito porque estaba quemando tokens".
  const porTipo = { frenado: 0, silencio: 0, acuse: 0, sinNada: 0 };
  for (const f of fallos.data ?? []) porTipo[tipoDeFallo(f.motivo)]++;
  const sinNada = (fallos.data ?? []).filter((f) => tipoDeFallo(f.motivo) === "sinNada");

  return NextResponse.json({
    respuestasHoy: respuestas.count ?? 0,
    revisor: revisor.data ?? null,
    // ⚠️ "Sin contestar" = SOLO los que se quedaron sin NADA. Los demás van aparte.
    sinContestarHoy: porTipo.sinNada,
    conAcuseHoy: porTipo.acuse,
    frenadosHoy: porTipo.frenado,
    silenciadosHoy: porTipo.silencio,
    fallos: sinNada.slice(0, 50).map((f) => ({ bot: f.bot, motivo: f.motivo, cuando: f.created_at })),
  });
}
