import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Ambas consultas son independientes: las lanzamos en paralelo.
  const [statsRes, affRes] = await Promise.all([
    supabaseAdmin
      .from("affiliate_stats")
      .select("user_id, balance, commission, clicks, registrations, ftd"),
    supabaseAdmin.from("affiliates").select("user_id, display_name"),
  ]);

  if (statsRes.error) {
    return NextResponse.json({ error: statsRes.error.message }, { status: 500 });
  }

  const stats = statsRes.data;
  const affiliates = affRes.data;

  const nameByUser = new Map(
    (affiliates ?? []).map((a) => [a.user_id, a.display_name])
  );

  const rows = (stats ?? [])
    .map((s) => ({
      user_id: s.user_id,
      display_name: nameByUser.get(s.user_id) ?? null,
      balance: Number(s.balance ?? 0),
      commission: Number(s.commission ?? 0),
      clicks: Number(s.clicks ?? 0),
      registrations: Number(s.registrations ?? 0),
      ftd: Number(s.ftd ?? 0),
    }))
    .sort((a, b) => b.commission - a.commission);

  return NextResponse.json({ stats: rows });
}
