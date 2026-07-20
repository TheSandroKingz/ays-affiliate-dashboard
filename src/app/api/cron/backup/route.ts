import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Copia de seguridad automática (cron diario): guarda una "foto" de las tablas
// de datos en `data_snapshots`. Permite restaurar si un día se corrompe o se
// borra algo por error. Conserva las últimas 14 copias. Protegido por CRON_SECRET.
// (No sustituye a una copia EXTERNA; ver scripts/backup.mjs para eso.)
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tablas = ["affiliates", "affiliate_daily_stats", "payments"];
  const data: Record<string, unknown[]> = {};
  for (const t of tablas) {
    const { data: rows } = await supabaseAdmin.from(t).select("*");
    data[t] = rows ?? [];
  }

  const { error } = await supabaseAdmin.from("data_snapshots").insert({ data });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Conservar solo las últimas 14 copias.
  const { data: viejas } = await supabaseAdmin
    .from("data_snapshots")
    .select("id")
    .order("created_at", { ascending: false })
    .range(14, 1000);
  if (viejas && viejas.length) {
    await supabaseAdmin
      .from("data_snapshots")
      .delete()
      .in("id", viejas.map((v) => v.id))
      .then(() => {}, () => {});
  }

  return NextResponse.json({
    ok: true,
    filas: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v.length])
    ),
  });
}
