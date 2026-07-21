import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { saludFreshbet } from "@/lib/seguridad";
import { enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Limpieza: borramos las claves de deduplicación de clics ya viejas
  // (la ventana anti-duplicado es de segundos, así que no hacen falta).
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("click_dedup")
    .delete()
    .lt("created_at", cutoff)
    .then(() => {}, () => {});

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

  // Vigilancia de FreshBet: si lleva días en silencio pese a haber tráfico,
  // avisamos al admin al móvil (fuga de dinero silenciosa). Blindado.
  let freshbetAlerta = false;
  try {
    const salud = await saludFreshbet();
    freshbetAlerta = salud.alerta;
    if (salud.alerta) {
      await enviarPush(ADMIN_USER_ID, {
        title: "⚠️ FreshBet en silencio",
        body: `${salud.diasSin} días sin ningún evento y ${salud.clics7} clics. Revisa que siga configurado.`,
        url: "/admin/actividad",
      });
    }
  } catch {
    /* nunca romper el cron */
  }

  return NextResponse.json({ inserted: rows.length, date: today, freshbetAlerta });
}
