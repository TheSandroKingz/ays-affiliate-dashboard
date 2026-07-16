import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";

export async function POST(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const erc = (body.walletErc20 ?? "").trim();
  const trc = (body.walletTrc20 ?? "").trim();

  // Validación también en el servidor (no fiarse solo del cliente).
  if (erc && !/^0x[a-fA-F0-9]{40}$/.test(erc)) {
    return NextResponse.json(
      { error: "La billetera de Ethereum (ERC-20) no es válida." },
      { status: 400 }
    );
  }
  if (trc && !/^T[a-zA-Z0-9]{33}$/.test(trc)) {
    return NextResponse.json(
      { error: "La billetera de Tron (TRC-20) no es válida." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update({
      wallet_erc20: erc || null,
      wallet_trc20: trc || null,
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
