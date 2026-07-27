import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tgEnviar, tgApi, OWNER_CHAT_ID } from "@/lib/telegram";

// Webhook del bot de Telegram: Telegram nos manda aquí cada mensaje.
//  - /start      → guardamos al jugador y le damos la bienvenida (el gancho).
//  - /stop       → se da de baja (no recibe más mensajes en masa).
//  - un jugador escribe → reenviamos la duda a TU Telegram (dueño).
//  - tú respondes a ese mensaje reenviado → el bot se lo manda al jugador.
//
// Seguridad: Telegram manda una cabecera secreta (secret_token) que ponemos al
// registrar el webhook; si no coincide, ignoramos (que nadie falsee updates).

// ⚠️ EDITA AQUÍ el mensaje de bienvenida (el "gancho" que ve al unirse):
const BIENVENIDA =
  "¡Bienvenido! 🎰🔥\n\n" +
  "Aquí te iré pasando <b>bonos, tips y jugadas</b> para que le saques más partido. " +
  "Cualquier duda, escríbeme por aquí y te ayudo. 😉";

export async function POST(request: Request) {
  // Verificación del secreto del webhook.
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (
    !process.env.TELEGRAM_WEBHOOK_SECRET ||
    secret !== process.env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ ok: true }); // 200 silencioso, no procesamos
  }

  const update = await request.json().catch(() => null);
  const msg = update?.message;
  // Solo mensajes normales (ignoramos edits, canales, etc.).
  if (!msg || !msg.chat) return NextResponse.json({ ok: true });

  const chatId: number = msg.chat.id;
  const text: string = (msg.text ?? "").trim();
  const from = msg.from ?? {};
  const esDueno = OWNER_CHAT_ID && String(chatId) === String(OWNER_CHAT_ID);

  try {
    // ── /start : alta del jugador + bienvenida ──────────────────────────────
    if (text === "/start" || text.startsWith("/start ")) {
      if (!esDueno) {
        await supabaseAdmin.from("telegram_contacts").upsert(
          {
            chat_id: chatId,
            first_name: from.first_name ?? null,
            username: from.username ?? null,
            opted_out: false,
          },
          { onConflict: "chat_id" }
        );
      }
      await tgEnviar(chatId, BIENVENIDA);
      return NextResponse.json({ ok: true });
    }

    // ── /stop : baja ────────────────────────────────────────────────────────
    if (text === "/stop" || text === "/baja") {
      await supabaseAdmin
        .from("telegram_contacts")
        .update({ opted_out: true })
        .eq("chat_id", chatId);
      await tgEnviar(chatId, "Hecho, no recibirás más mensajes. Escribe /start para volver.");
      return NextResponse.json({ ok: true });
    }

    // ── El DUEÑO responde a una duda reenviada → mandarla al jugador ─────────
    // Usamos copyMessage: copia TU respuesta tal cual (texto, foto, vídeo, gif…)
    // al jugador. Así puedes contestar con lo que quieras, no solo texto.
    if (esDueno && msg.reply_to_message?.text) {
      const m = msg.reply_to_message.text.match(/id:(\d+)/);
      if (m) {
        const r = await tgApi("copyMessage", {
          chat_id: Number(m[1]),
          from_chat_id: chatId,
          message_id: msg.message_id,
        });
        await tgEnviar(
          chatId,
          r?.ok
            ? "✅ Enviado."
            : "⚠️ No se pudo enviar (puede que el jugador bloqueara el bot)."
        );
      } else {
        await tgEnviar(chatId, "No pude identificar a quién responder.");
      }
      return NextResponse.json({ ok: true });
    }

    // ── Un JUGADOR escribe (texto o foto/vídeo) → reenviar al dueño ──────────
    if (!esDueno) {
      // Marca actividad + asegura que está dado de alta.
      await supabaseAdmin.from("telegram_contacts").upsert(
        {
          chat_id: chatId,
          first_name: from.first_name ?? null,
          username: from.username ?? null,
          last_msg_at: new Date().toISOString(),
        },
        { onConflict: "chat_id" }
      );
      if (OWNER_CHAT_ID) {
        const quien =
          (from.first_name ?? "Jugador") +
          (from.username ? ` (@${from.username})` : "");
        // Cabecera con el id (para que puedas responder) + su mensaje.
        await tgEnviar(
          OWNER_CHAT_ID,
          `💬 <b>${quien}</b>${text ? " pregunta:\n" + text : " te ha enviado algo:"}\n\n<i>↩️ Responde a este mensaje para contestarle · id:${chatId}</i>`
        );
        // Si trae foto/vídeo/etc (mensaje sin texto), lo copiamos también.
        if (!text) {
          await tgApi("copyMessage", {
            chat_id: OWNER_CHAT_ID,
            from_chat_id: chatId,
            message_id: msg.message_id,
          });
        }
      }
      return NextResponse.json({ ok: true });
    }
  } catch {
    /* nunca devolvemos error: Telegram reintentaría en bucle */
  }

  return NextResponse.json({ ok: true });
}
