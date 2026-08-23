import { NextResponse } from "next/server";
import { compararSecreto } from "@/lib/secreto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tgApi } from "@/lib/telegram";
import { BOTS } from "@/lib/bots";
import { enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// VIGILANTE DE SALUD DE LOS BOTS (cron). Cada pocos minutos le pregunta a
// Telegram por CADA bot (getWebhookInfo) si su webhook sigue enganchado y
// procesando. Si detecta que uno está CAÍDO (webhook desconectado, apuntando a
// otra URL, con errores de entrega o con updates atascados) te manda una
// notificación push al momento, para que no vuelva a pasar lo de Livana (se
// quedó muda sin que nadie se enterara). Protegido por CRON_SECRET.
//
// Anti-spam: como MUCHO un aviso por bot y por HORA (throttle con click_dedup),
// para que un bot caído no te machaque a notificaciones cada vez que corre.

type BotChk = { key: string; label: string; token: string; pathEsperado: string };

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!compararSecreto(authHeader?.replace("Bearer ", ""), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Bot de Sandro (token por defecto) + bots nuevos (Jeffer/Livana/Black KP…).
  // Solo los que tienen token configurado (los demás no están montados).
  const lista: BotChk[] = [];
  const tokenSandro = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (tokenSandro) {
    lista.push({
      key: "as",
      label: "A&S (Sandro)",
      token: tokenSandro,
      pathEsperado: "/api/telegram/webhook",
    });
  }
  for (const b of Object.values(BOTS)) {
    if (b.token) {
      lista.push({
        key: b.key,
        label: b.label,
        token: b.token,
        pathEsperado: `/api/telegram/webhook/${b.key}`,
      });
    }
  }

  const ahora = Math.floor(Date.now() / 1000);
  const problemas: { key: string; label: string; motivo: string }[] = [];

  await Promise.all(
    lista.map(async (b) => {
      const info = await tgApi("getWebhookInfo", {}, b.token);
      if (!info?.ok || !info.result) {
        problemas.push({ key: b.key, label: b.label, motivo: "no responde la API de Telegram (token/red)" });
        return;
      }
      const r = info.result as {
        url?: string;
        pending_update_count?: number;
        last_error_date?: number;
        last_error_message?: string;
      };
      const pend = r.pending_update_count ?? 0;
      const errReciente = !!r.last_error_date && ahora - r.last_error_date < 900; // 15 min

      if (!r.url) {
        problemas.push({ key: b.key, label: b.label, motivo: "webhook DESCONECTADO (sin URL)" });
      } else if (!r.url.includes(b.pathEsperado)) {
        problemas.push({ key: b.key, label: b.label, motivo: `el webhook apunta a otra URL: ${r.url}` });
      } else if (pend > 20) {
        // Updates acumulados = el webhook no los está procesando (caído/erroneo).
        problemas.push({ key: b.key, label: b.label, motivo: `${pend} mensajes atascados sin procesar` });
      } else if (errReciente && pend > 0) {
        // Error de entrega MUY reciente y con cola: fallo en curso (no uno viejo ya resuelto).
        problemas.push({
          key: b.key,
          label: b.label,
          motivo: `error de entrega: ${r.last_error_message ?? "desconocido"}`,
        });
      }
    })
  );

  // Avisa (push al admin), throttle a 1/bot/hora.
  for (const p of problemas) {
    const bucket = Math.floor(Date.now() / 3_600_000); // hora actual
    let avisar = true;
    try {
      const { data: ins } = await supabaseAdmin
        .from("click_dedup")
        .upsert({ key: `health:${p.key}:${bucket}` }, { onConflict: "key", ignoreDuplicates: true })
        .select();
      // Si NO insertó nada, ya avisamos de este bot esta hora → no repetir.
      avisar = !(Array.isArray(ins) && ins.length === 0);
    } catch {
      avisar = true; // ante la duda, mejor avisar
    }
    if (avisar) {
      await enviarPush(ADMIN_USER_ID, {
        title: `🚨 Bot caído: ${p.label}`,
        body: `${p.motivo}. Entra a reconectarlo.`,
        url: "/admin/bots",
        tag: `health-${p.key}`,
      });
    }
  }

  return NextResponse.json({
    ok: problemas.length === 0,
    revisados: lista.map((b) => b.key),
    problemas,
  });
}
