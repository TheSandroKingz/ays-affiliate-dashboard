import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());

  const { data: affiliates, error: affError } = await supabaseAdmin
    .from("affiliates")
    .select("user_id");

  if (affError) {
    return NextResponse.json({ error: affError.message }, { status: 500 });
  }

  const rows = (affiliates ?? [])
    .filter((a) => a.user_id)
    .map((a) => ({
      user_id: a.user_id,
      date: today,
      commission: 0,
      clicks: 0,
      registrations: 0,
      ftd: 0,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, date: today });
  }

  const { error } = await supabaseAdmin
    .from("affiliate_daily_stats")
    .upsert(rows, { onConflict: "user_id,date", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: rows.length, date: today });
}
