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

  if (!ref) {
    return NextResponse.json({ displayName: null });
  }

  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("display_name")
    .eq("id", ref)
    .maybeSingle();

  return NextResponse.json({ displayName: data?.display_name ?? null });
}
