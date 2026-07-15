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
    const { data: statsData } = await supabaseAdmin
      .from("affiliate_stats")
      .select("user_id, commission")
      .in("user_id", userIds);

    stats = statsData ?? [];
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