import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Guarda la "promo activa" que el bot menciona (bono/recarga real).
export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const promo = String(body?.promo ?? "").trim().slice(0, 500);
  const { error } = await supabaseAdmin
    .from("telegram_config")
    .upsert({ id: 1, promo: promo || null, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}
