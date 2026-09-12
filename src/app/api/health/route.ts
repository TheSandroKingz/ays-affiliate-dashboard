import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { repararWebhooks } from "@/lib/botHealth";
import { enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminId";

// ── PUNTO DE CONTROL EXTERNO ───────────────────────────────────────────────
// Para engancharle un vigilante de fuera (cron-job.org, UptimeRobot… gratis)
// que lo llame cada 5 minutos y avise al móvil si falla.
//
// ¿Por qué de FUERA y no un cron nuestro? Porque si lo que se cae es Vercel,
// ningún cron nuestro se va a enterar ni va a poder avisar. El vigilante tiene
// que vivir en otro sitio. Los crons de aquí solo pueden correr 8 veces al día
// (plan gratis), o sea que entre uno y otro pasan ~3 horas.
//
// Devuelve 200 si todo va, y 503 si algo falla (que es lo que hace saltar la
// alarma del vigilante). NO expone ningún dato: solo si está vivo o no.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET() {
  const t0 = Date.now();
  const fallos: string[] = [];
  let reparado: string[] = [];

  // 1) ¿Responde la base de datos? (consulta mínima, solo cuenta cabeceras)
  try {
    const { error } = await supabaseAdmin
      .from("telegram_config")
      .select("id", { count: "exact", head: true });
    if (error) fallos.push("bd");
  } catch {
    fallos.push("bd");
  }

  // 2) ¿Sigue Telegram apuntando a nuestro webhook y sin errores acumulados?
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (token) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
        signal: AbortSignal.timeout(6000),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        result?: { url?: string; last_error_message?: string; pending_update_count?: number };
      };
      const info = j?.result;
      if (!j?.ok || !info?.url) {
        // 🔧 SE ARREGLA SOLO. Es el fallo que más papeletas tiene de pillarte
        // fuera de casa, y antes había que entrar al panel a reconectarlo a
        // mano. Con el vigilante externo llamando cada 5 minutos, el webhook se
        // recompone solo como mucho 5 minutos después de caerse.
        const reparados = await repararWebhooks();
        if (reparados.length) {
          reparado = reparados;
          await enviarPush(ADMIN_USER_ID, {
            title: "🔧 Webhook caído y reconectado solo",
            body: `Telegram se había quedado sin el webhook de: ${reparados.join(", ")}. Ya está puesto otra vez, no tienes que hacer nada.`,
            url: "/admin/bots",
          }).catch(() => {});
        } else {
          fallos.push("webhook_sin_url");
        }
      }
      // Si se le amontonan actualizaciones sin procesar, el bot está atascado.
      else if ((info.pending_update_count ?? 0) > 50) fallos.push("webhook_atascado");
    } catch {
      fallos.push("telegram");
    }
  }

  const ok = fallos.length === 0;
  return NextResponse.json(
    { ok, fallos, reparado, ms: Date.now() - t0 },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
