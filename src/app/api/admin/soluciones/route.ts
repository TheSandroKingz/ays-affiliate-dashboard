import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getGestorBot } from "@/lib/adminAuth";

// Banco de soluciones verificadas (Adenda 1). Yaiza (o admin) aprueba/descarta las
// soluciones detectadas. Solo lo pueden tocar los gestores del bot.
//
// POST body: { id: number, accion: "aprobar" | "descartar" | "sustituir", sustituye_a?: number }
//  - aprobar:   estado -> "aprobada" (+ fecha_aprobacion). El bot ya puede usarla.
//  - descartar: estado -> "descartada". No se usa nunca.
//  - sustituir: aprueba esta y DESCARTA la aprobada anterior (sustituye_a) — para
//               cuando la nueva es mejor versión de un problema ya aprobado.

export async function POST(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: { id?: number; accion?: string; sustituye_a?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const id = Number(body.id);
  const accion = body.accion;
  if (!id || !accion) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });

  if (accion === "descartar") {
    const { error } = await supabaseAdmin
      .from("soluciones_verificadas")
      .update({ estado: "descartada" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, estado: "descartada" });
  }

  if (accion === "aprobar" || accion === "sustituir") {
    const { error } = await supabaseAdmin
      .from("soluciones_verificadas")
      .update({ estado: "aprobada", fecha_aprobacion: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // sustituir: la aprobada anterior se descarta para no dejar dos versiones vivas.
    if (accion === "sustituir" && body.sustituye_a) {
      await supabaseAdmin
        .from("soluciones_verificadas")
        .update({ estado: "descartada" })
        .eq("id", Number(body.sustituye_a));
    }
    return NextResponse.json({ ok: true, estado: "aprobada" });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
