import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Sumamos la actividad real (affiliate_daily_stats, donde se acumulan los
  // postbacks) por afiliado, y calculamos los totales globales de la red.
  const [dailyRes, affRes] = await Promise.all([
    supabaseAdmin
      .from("affiliate_daily_stats")
      .select("user_id, commission, clicks, registrations, ftd"),
    supabaseAdmin.from("affiliates").select("user_id, display_name"),
  ]);

  if (dailyRes.error) {
    return NextResponse.json({ error: dailyRes.error.message }, { status: 500 });
  }

  const byUser = new Map<
    string,
    { commission: number; clicks: number; registrations: number; ftd: number }
  >();
  for (const d of dailyRes.data ?? []) {
    const acc = byUser.get(d.user_id) ?? {
      commission: 0,
      clicks: 0,
      registrations: 0,
      ftd: 0,
    };
    acc.commission += Number(d.commission ?? 0);
    acc.clicks += Number(d.clicks ?? 0);
    acc.registrations += Number(d.registrations ?? 0);
    acc.ftd += Number(d.ftd ?? 0);
    byUser.set(d.user_id, acc);
  }

  const rows = (affRes.data ?? [])
    .map((a) => {
      const s = byUser.get(a.user_id) ?? {
        commission: 0,
        clicks: 0,
        registrations: 0,
        ftd: 0,
      };
      return {
        user_id: a.user_id,
        display_name: a.display_name,
        commission: s.commission,
        clicks: s.clicks,
        registrations: s.registrations,
        ftd: s.ftd,
      };
    })
    .sort((a, b) => b.commission - a.commission);

  const totals = rows.reduce(
    (acc, r) => ({
      commission: acc.commission + r.commission,
      clicks: acc.clicks + r.clicks,
      registrations: acc.registrations + r.registrations,
      ftd: acc.ftd + r.ftd,
    }),
    { commission: 0, clicks: 0, registrations: 0, ftd: 0 }
  );

  return NextResponse.json({ stats: rows, totals });
}
