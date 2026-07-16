import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";

// Panel de admin = lo que TÚ te quedas por tu estructura.
// Por cada FTD que trae un afiliado tuyo, tu margen = (tu CPA de freshbet) −
// (el CPA que le pagas a ese afiliado). Como affiliate_daily_stats guarda la
// comisión ya pagada al afiliado y el nº de FTD, tu margen exacto es:
//     margen = TU_CPA × ftd − comisión_pagada_al_afiliado
// (vale aunque el afiliado tenga CPA distinto por país).
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 1) Tu fila de admin: tu id (para saber quién cuelga de ti) y tu CPA.
  const { data: me } = await supabaseAdmin
    .from("affiliates")
    .select("id, cpa_spain, cpa_other")
    .eq("user_id", user.id)
    .maybeSingle();

  const adminCpa = Number(me?.cpa_spain ?? 0);

  // 2) Tu estructura: los afiliados que te tienen a ti como "referido_por".
  const { data: structure, error: structErr } = await supabaseAdmin
    .from("affiliates")
    .select("user_id, display_name")
    .eq("referred_by", me?.id ?? "00000000-0000-0000-0000-000000000000");

  if (structErr) {
    return NextResponse.json({ error: structErr.message }, { status: 500 });
  }

  const structUserIds = (structure ?? []).map((s) => s.user_id);

  // 3) Actividad diaria de esos afiliados (postbacks reales).
  let daily: {
    user_id: string;
    date: string;
    commission: number;
    clicks: number;
    registrations: number;
    ftd: number;
  }[] = [];

  if (structUserIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("affiliate_daily_stats")
      .select("user_id, date, commission, clicks, registrations, ftd")
      .in("user_id", structUserIds);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    daily = data ?? [];
  }

  // 4) Agregado por afiliado (todo el histórico) + su margen para ti.
  const byUser = new Map<
    string,
    { commission: number; clicks: number; registrations: number; ftd: number }
  >();
  for (const d of daily) {
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

  const stats = (structure ?? [])
    .map((a) => {
      const s = byUser.get(a.user_id) ?? {
        commission: 0,
        clicks: 0,
        registrations: 0,
        ftd: 0,
      };
      const margin = adminCpa * s.ftd - s.commission;
      return {
        user_id: a.user_id,
        display_name: a.display_name,
        commission: s.commission, // lo que le pagas
        clicks: s.clicks,
        registrations: s.registrations,
        ftd: s.ftd,
        margin, // lo que te quedas tú
      };
    })
    .sort((a, b) => b.margin - a.margin);

  const totals = stats.reduce(
    (acc, r) => ({
      commission: acc.commission + r.commission,
      clicks: acc.clicks + r.clicks,
      registrations: acc.registrations + r.registrations,
      ftd: acc.ftd + r.ftd,
      margin: acc.margin + r.margin,
    }),
    { commission: 0, clicks: 0, registrations: 0, ftd: 0, margin: 0 }
  );

  // 5) Serie diaria agregada de toda la estructura (para el gráfico de margen).
  const byDate = new Map<
    string,
    { commission: number; clicks: number; registrations: number; ftd: number }
  >();
  for (const d of daily) {
    const key = String(d.date).slice(0, 10);
    const acc = byDate.get(key) ?? {
      commission: 0,
      clicks: 0,
      registrations: 0,
      ftd: 0,
    };
    acc.commission += Number(d.commission ?? 0);
    acc.clicks += Number(d.clicks ?? 0);
    acc.registrations += Number(d.registrations ?? 0);
    acc.ftd += Number(d.ftd ?? 0);
    byDate.set(key, acc);
  }
  const dailySeries = Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return NextResponse.json({ adminCpa, stats, totals, daily: dailySeries });
}
