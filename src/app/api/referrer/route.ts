import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  // Endpoint público (lo usa la página de registro con ?ref=). Limitamos por IP
  // para que no se pueda sondear masivamente la tabla de afiliados.
  const ip = getClientIp(request);
  if (!rateLimit(`referrer:${ip}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ displayName: null }, { status: 429 });
  }

  const { ref } = await request.json().catch(() => ({}));

  // Solo aceptamos un UUID válido. Sin esto, cualquier texto entraba a la consulta
  // (podía dar error de BD con "id" no-uuid) y se podría sondear la tabla. Con el
  // filtro, solo un id exacto y bien formado consulta, y solo devuelve el nombre.
  const esUUID =
    typeof ref === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  if (!esUUID) {
    return NextResponse.json({ displayName: null });
  }

  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("display_name")
    .eq("id", ref)
    .maybeSingle();

  return NextResponse.json({ displayName: data?.display_name ?? null });
}
