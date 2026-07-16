import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { walletErc20, walletTrc20 } = await request.json();

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update({
      wallet_erc20: (walletErc20 ?? "").trim() || null,
      wallet_trc20: (walletTrc20 ?? "").trim() || null,
    })
    .eq("user_id", authData.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
