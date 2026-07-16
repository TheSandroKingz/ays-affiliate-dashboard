import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";

export async function POST(request: NextRequest) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = user.id;

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

  const percent = (ownAffiliate.subaffiliate_percent ?? 0) / 100;
  let rows: { id: string; displayName: string | null; commission: number }[] = [];
  // Total histórico que este afiliado ha generado por sus subafiliados
  // (todo lo acumulado, aunque ya se haya cobrado).
  let totalHistorico = 0;

  if (userIds.length > 0) {
    // El día 1 el balance se reinicia, así que la comisión del panel es la
    // del mes en curso; pero también sumamos el histórico completo aparte.
    const monthStart =
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" })
        .format(new Date())
        .slice(0, 7) + "-01";

    const { data: dailyData } = await supabaseAdmin
      .from("affiliate_daily_stats")
      .select("user_id, commission, date")
      .in("user_id", userIds);

    const sumMes = new Map<string, number>();
    const sumHist = new Map<string, number>();
    for (const d of dailyData ?? []) {
      const c = Number(d.commission);
      sumHist.set(d.user_id, (sumHist.get(d.user_id) ?? 0) + c);
      if (String(d.date) >= monthStart)
        sumMes.set(d.user_id, (sumMes.get(d.user_id) ?? 0) + c);
    }

    rows = (subAffiliates ?? []).map((s) => ({
      id: s.id,
      displayName: s.display_name,
      commission: (sumMes.get(s.user_id) ?? 0) * percent,
    }));
    totalHistorico = (subAffiliates ?? []).reduce(
      (sum, s) => sum + (sumHist.get(s.user_id) ?? 0) * percent,
      0
    );
  }

  return NextResponse.json({ rows, totalHistorico });
}