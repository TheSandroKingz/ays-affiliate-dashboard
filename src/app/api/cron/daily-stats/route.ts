import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { saludFreshbet } from "@/lib/seguridad";
import { enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";
import { computeAdminStats, type DailyRow, type StructRow } from "@/lib/adminStats";

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

  // Resumen de AYER al admin (solo si hubo actividad). Blindado.
  try {
    const [ty, tm, td] = today.split("-").map(Number);
    const ad = new Date(Date.UTC(ty, tm - 1, td));
    ad.setUTCDate(ad.getUTCDate() - 1);
    const ayer = ad.toISOString().slice(0, 10);

    const { data: me } = await supabaseAdmin
      .from("affiliates")
      .select("id, cpa_spain")
      .eq("user_id", ADMIN_USER_ID)
      .maybeSingle();
    const { data: structure } = await supabaseAdmin
      .from("affiliates")
      .select("id, user_id, display_name, referred_by, subaffiliate_percent")
      .neq("user_id", ADMIN_USER_ID);
    const ids = [ADMIN_USER_ID, ...(structure ?? []).map((s) => s.user_id)];
    const { data: dayRows } = await supabaseAdmin
      .from("affiliate_daily_stats")
      .select("user_id, date, commission, clicks, registrations, ftd")
      .in("user_id", ids)
      .eq("date", ayer);
    const r = computeAdminStats(
      (dayRows ?? []) as DailyRow[],
      ADMIN_USER_ID,
      me?.id,
      Number(me?.cpa_spain ?? 0),
      (structure ?? []) as StructRow[]
    );
    if (r.totals.ftd > 0 || r.totals.registrations > 0) {
      await enviarPush(ADMIN_USER_ID, {
        title: "📊 Resumen de ayer",
        body: `${r.totals.ftd} FTD · +${Math.round(r.totals.totalClean)}€ limpio · ${r.totals.registrations} registros`,
        url: "/admin",
      });
    }
  } catch {
    /* nunca romper el cron */
  }

  // Aviso de cumpleaños de afiliados (hoy). Blindado.
  try {
    const md = today.slice(5); // MM-DD
    const { data: cumples } = await supabaseAdmin
      .from("affiliates")
      .select("display_name, birthdate")
      .not("birthdate", "is", null);
    for (const c of cumples ?? []) {
      if (String(c.birthdate).slice(5) === md) {
        await enviarPush(ADMIN_USER_ID, {
          title: "🎂 Cumpleaños",
          body: `Hoy cumple ${c.display_name}. ¡Felicítale!`,
          url: "/admin",
        });
      }
    }
  } catch {
    /* columna no disponible o sin datos */
  }

  // Resumen SEMANAL los lunes (últimos 7 días). Blindado.
  try {
    const dow = new Date(today + "T12:00:00Z").getUTCDay(); // 1 = lunes
    if (dow === 1) {
      const [ty, tm, td] = today.split("-").map(Number);
      const ini = new Date(Date.UTC(ty, tm - 1, td));
      ini.setUTCDate(ini.getUTCDate() - 7);
      const desde = ini.toISOString().slice(0, 10);
      const { data: me } = await supabaseAdmin
        .from("affiliates").select("id, cpa_spain").eq("user_id", ADMIN_USER_ID).maybeSingle();
      const { data: structure } = await supabaseAdmin
        .from("affiliates")
        .select("id, user_id, display_name, referred_by, subaffiliate_percent")
        .neq("user_id", ADMIN_USER_ID);
      const ids = [ADMIN_USER_ID, ...(structure ?? []).map((s) => s.user_id)];
      const { data: wRows } = await supabaseAdmin
        .from("affiliate_daily_stats")
        .select("user_id, date, commission, clicks, registrations, ftd")
        .in("user_id", ids)
        .gte("date", desde)
        .lt("date", today);
      const r = computeAdminStats(
        (wRows ?? []) as DailyRow[], ADMIN_USER_ID, me?.id,
        Number(me?.cpa_spain ?? 0), (structure ?? []) as StructRow[]
      );
      await enviarPush(ADMIN_USER_ID, {
        title: "📅 Resumen de la semana",
        body: `${r.totals.ftd} FTD · +${Math.round(r.totals.totalClean)}€ limpio · ${r.totals.registrations} registros`,
        url: "/admin",
      });
    }
  } catch {
    /* nunca romper el cron */
  }

  // Aviso: afiliado que lleva 7 días sin entrar (para darle un toque). Blindado.
  try {
    const { data: affs } = await supabaseAdmin
      .from("affiliates")
      .select("user_id, display_name")
      .neq("user_id", ADMIN_USER_ID)
      .eq("approved", true);
    const hoyMs = new Date(today + "T00:00:00Z").getTime();
    for (const a of affs ?? []) {
      const { data: vis } = await supabaseAdmin
        .from("dashboard_visits")
        .select("date")
        .eq("user_id", a.user_id)
        .order("date", { ascending: false })
        .limit(1);
      const ultima = vis?.[0]?.date;
      if (!ultima) continue;
      const dias = Math.round(
        (hoyMs - new Date(String(ultima) + "T00:00:00Z").getTime()) / 86400000
      );
      if (dias === 7) {
        await enviarPush(ADMIN_USER_ID, {
          title: "👀 Afiliado inactivo",
          body: `${a.display_name} lleva 7 días sin entrar. ¿Le das un toque?`,
          url: "/admin",
        });
      }
    }
  } catch {
    /* tabla de visitas no disponible aún */
  }

  return NextResponse.json({ inserted: rows.length, date: today, freshbetAlerta });
}
