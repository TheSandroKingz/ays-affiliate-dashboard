import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { ADMIN_USER_ID } from "@/lib/adminId";

// Puesto del afiliado entre todos (por FTD del mes). Solo devuelve SU posición y
// el total, nunca los datos de los demás. Sirve para competencia sana.
export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  const from = hoy.slice(0, 7) + "-01";

  // Afiliados (no el admin) activos.
  const { data: affs } = await supabaseAdmin
    .from("affiliates")
    .select("user_id")
    .neq("user_id", ADMIN_USER_ID);
  const ids = (affs ?? []).map((a) => a.user_id);
  if (!ids.length) return NextResponse.json({ puesto: 1, total: 1, miFtd: 0 });

  const { data: daily } = await supabaseAdmin
    .from("affiliate_daily_stats")
    .select("user_id, ftd")
    .in("user_id", ids)
    .gte("date", from)
    .lte("date", hoy);

  const ftdByUser = new Map<string, number>();
  for (const d of daily ?? []) {
    ftdByUser.set(d.user_id, (ftdByUser.get(d.user_id) ?? 0) + Number(d.ftd ?? 0));
  }

  const miFtd = ftdByUser.get(user.id) ?? 0;
  // Puesto justo (los empates comparten posición): 1 + nº de afiliados con MÁS FTD.
  const mejores = ids.filter((id) => (ftdByUser.get(id) ?? 0) > miFtd).length;

  return NextResponse.json({ puesto: mejores + 1, total: ids.length, miFtd });
}
