import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !authData.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = authData.user.id;

  const { data: ownAffiliate, error: ownError } = await supabaseAdmin
    .from("affiliates")
    .select("id, subaffiliate_percent")
    .eq("user_id", userId)
    .single();

  if (ownError || !ownAffiliate) {
    return NextResponse.json({ error: "Afiliado no encontrado" }, { status: 404 });
  }

  const { data: subAffiliates, error: subError } = await supabaseAdmin
    .from("affiliates")
    .select("id, display_name, user_id")
    .eq("referred_by", ownAffiliate.id);

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }

  const userIds = (subAffiliates ?? []).map((s) => s.user_id);

  let stats: { user_id: string; commission: number }[] = [];

  if (userIds.length > 0) {
    // Comisión del MES ACTUAL de cada subafiliado. El modelo se reinicia el
    // día 1, así que sumamos solo desde el primer día del mes en curso
    // (zona horaria de Madrid) en affiliate_daily_stats.
    const monthStart =
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" })
        .format(new Date())
        .slice(0, 7) + "-01";

    const { data: dailyData } = await supabaseAdmin
      .from("affiliate_daily_stats")
      .select("user_id, commission")
      .in("user_id", userIds)
      .gte("date", monthStart);

    const sumByUser = new Map<string, number>();
    for (const d of dailyData ?? []) {
      sumByUser.set(
        d.user_id,
        (sumByUser.get(d.user_id) ?? 0) + Number(d.commission)
      );
    }
    stats = userIds.map((id) => ({
      user_id: id,
      commission: sumByUser.get(id) ?? 0,
    }));
  }

  const percent = (ownAffiliate.subaffiliate_percent ?? 0) / 100;

  const rows = (subAffiliates ?? []).map((s) => {
    const stat = stats.find((st) => st.user_id === s.user_id);
    const subCommission = stat ? Number(stat.commission) : 0;
    return {
      id: s.id,
      displayName: s.display_name,
      commission: subCommission * percent,
    };
  });

  return NextResponse.json({ rows });
}