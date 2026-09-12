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

// ── AUTO-REPARACIÓN DEL WEBHOOK ────────────────────────────────────────────
// El fallo que más probable es que te pille fuera de casa: Telegram se queda
// sin el webhook (un despliegue raro, un cambio de dominio, o alguien tocando
// el bot) y deja de llegar NADA. Antes había que entrar al panel a darle a
// "Conectar webhook" a mano.
//
// Esto lo vuelve a poner solo. Es seguro:
//   · La URL sale SIEMPRE de la base de confianza (NEXT_PUBLIC_SITE_URL o
//     VERCEL_URL, que las fija la plataforma), NUNCA de una cabecera del
//     cliente, que es falsificable.
//   · Es idempotente: si ya está bien, no toca nada.
//   · Lo peor que puede provocar alguien llamándolo es que el webhook se quede
//     apuntando a donde ya tenía que apuntar.
export async function repararWebhooks(): Promise<string[]> {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!base) return [];

  const lista: { key: string; token: string; secret: string; path: string }[] = [];
  const tokenSandro = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const secretSandro = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (tokenSandro && secretSandro) {
    lista.push({ key: "as", token: tokenSandro, secret: secretSandro, path: "/api/telegram/webhook" });
  }
  for (const b of Object.values(BOTS)) {
    if (b.token && b.secret) {
      lista.push({ key: b.key, token: b.token, secret: b.secret, path: `/api/telegram/webhook/${b.key}` });
    }
  }

  const reparados: string[] = [];
  await Promise.all(
    lista.map(async (b) => {
      try {
        const info = await tgApi("getWebhookInfo", {}, b.token);
        const actual = (info?.result as { url?: string } | undefined)?.url ?? "";
        const esperada = `${base}${b.path}`;
        if (actual === esperada) return; // todo en orden
        const r = await tgApi(
          "setWebhook",
          { url: esperada, secret_token: b.secret, allowed_updates: ["message", "callback_query"] },
          b.token
        );
        if (r?.ok) reparados.push(b.key);
      } catch {
        /* si no se puede, lo dirá el chequeo de salud */
      }
    })
  );
  return reparados;
}

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
