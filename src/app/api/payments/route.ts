import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  const { userId } = await request.json();

  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("id, amount, date, status")
    .eq("user_id", userId)
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
