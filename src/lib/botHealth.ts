import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tgApi } from "@/lib/telegram";
import { BOTS } from "@/lib/bots";
import { enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminAuth";

// VIGILANTE DE SALUD DE LOS BOTS. Le pregunta a Telegram por CADA bot
// (getWebhookInfo) si su webhook sigue enganchado y procesando. Si detecta que
// uno está CAÍDO (webhook desconectado, apuntando a otra URL, con errores de
// entrega recientes o con updates atascados) manda una notificación push al
// admin, como MUCHO una vez por bot y por HORA (throttle con click_dedup), para
// que no vuelva a pasar lo de Livana (se quedó muda sin que nadie se enterara).
// BLINDADO: cualquier fallo se traga (nunca rompe el flujo que la llama).

export type SaludResultado = {
  ok: boolean;
  revisados: string[];
  problemas: { key: string; label: string; motivo: string }[];
};

type BotChk = { key: string; label: string; token: string; pathEsperado: string };

export async function revisarSaludBots(): Promise<SaludResultado> {
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
  const problemas: SaludResultado["problemas"] = [];

  await Promise.all(
    lista.map(async (b) => {
      try {
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
      } catch {
        // Un fallo consultando un bot no debe tumbar la revisión de los demás.
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
      try {
        await enviarPush(ADMIN_USER_ID, {
          title: `🚨 Bot caído: ${p.label}`,
          body: `${p.motivo}. Entra a reconectarlo.`,
          url: "/admin/bots",
          tag: `health-${p.key}`,
        });
      } catch {
        /* nunca romper */
      }
    }
  }

  return { ok: problemas.length === 0, revisados: lista.map((b) => b.key), problemas };
}
