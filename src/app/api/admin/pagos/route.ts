import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Historial de pagos registrados (solo admin): últimos 100, con el nombre del
// afiliado. Para llevar la cuenta de lo que ya has pagado, a quién y cuándo.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: pagos, error } = await supabaseAdmin
    .from("payments")
    .select("id, user_id, amount, date, status")
    .order("date", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ pagos: [] });
  }

  const ids = [...new Set((pagos ?? []).map((p) => p.user_id))];
  const names = new Map<string, string | null>();
  if (ids.length) {
    const { data: affs } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, display_name")
      .in("user_id", ids);
    for (const a of affs ?? []) names.set(a.user_id, a.display_name);
  }

  const rows = (pagos ?? []).map((p) => ({
    id: p.id,
    amount: Number(p.amount ?? 0),
    date: p.date,
    name: names.get(p.user_id) ?? null,
  }));

  return NextResponse.json({ pagos: rows });
}
