import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { depositoMedio } from "@/lib/postback";

// Calidad de tráfico del propio afiliado: su tasa de conversión (FTD por clics)
// y, si algún día hay datos, su depósito medio. Solo su propio dato (del token).
export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const deposito = await depositoMedio(user.id);

  // Conversión: sobre todo el histórico del afiliado.
  const { data } = await supabaseAdmin
    .from("affiliate_daily_stats")
    .select("clicks, ftd")
    .eq("user_id", user.id);
  let clicks = 0;
  let ftd = 0;
  for (const d of data ?? []) {
    clicks += Number(d.clicks ?? 0);
    ftd += Number(d.ftd ?? 0);
  }
  const conversion = {
    clicks,
    ftd,
    pct: clicks > 0 ? (ftd / clicks) * 100 : null,
  };

  return NextResponse.json({ deposito, conversion });
}
