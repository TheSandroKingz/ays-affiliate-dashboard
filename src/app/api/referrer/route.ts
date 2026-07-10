import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  const { ref } = await request.json();

  if (!ref) {
    return NextResponse.json({ displayName: null });
  }

  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("display_name")
    .eq("id", ref)
    .single();

  return NextResponse.json({ displayName: data?.display_name ?? null });
}
