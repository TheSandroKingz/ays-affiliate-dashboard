import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tgEnviar, tgApi, OWNER_CHAT_ID, botonJugar } from "@/lib/telegram";
import { responderIA, iaConfigurada } from "@/lib/telegramAI";

type Turno = { role: "user" | "assistant"; content: string };

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
  "¡Klk manito! 👋🔥\n\n" +
  "Ya tú sabe que aquí te voy pasando las <b>movidas, promos y jugadas</b> pa' que estés siempre activo. 🎰\n\n" +
  "Cualquier duda me escribes por aquí mismo y te resuelvo al momento, tranqui. ¡Dale que esto es una lokera! 💪";

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

  // ── Toque en un botón inline (ej. "❓ AYUDA") ────────────────────────────
  const cb = update?.callback_query;
  if (cb) {
    await tgApi("answerCallbackQuery", { callback_query_id: cb.id });
    const cid = cb.message?.chat?.id;
    if (cid && cb.data === "ayuda") {
      await tgEnviar(
        cid,
        "¡Klk! 👋 Escríbeme aquí mismo tu duda y te ayudo al momento, manito. 🔥"
      );
    }
    return NextResponse.json({ ok: true });
  }

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
      await tgEnviar(chatId, BIENVENIDA, { reply_markup: botonJugar() });
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

    // ── El DUEÑO configura el MENSAJE DIARIO automático ─────────────────────
    // Mandas "/diario" junto a un vídeo/foto (en el pie) y se guarda; cada
    // mañana el cron lo reenvía a todos. "/diario off" lo pausa, "/diario on"
    // lo reactiva, "/diario <texto>" guarda solo texto.
    const cmdDiario = (text || (msg.caption ?? "")).trim();
    if (esDueno && cmdDiario.toLowerCase().startsWith("/diario")) {
      const resto = cmdDiario.replace(/^\/diario\s*/i, "").trim();
      if (/^off$/i.test(resto)) {
        await supabaseAdmin
          .from("telegram_daily")
          .upsert({ id: 1, enabled: false, updated_at: new Date().toISOString() });
        await tgEnviar(chatId, "⏸️ Mensaje diario pausado. /diario on para reactivarlo.");
        return NextResponse.json({ ok: true });
      }
      if (/^on$/i.test(resto)) {
        await supabaseAdmin
          .from("telegram_daily")
          .upsert({ id: 1, enabled: true, updated_at: new Date().toISOString() });
        await tgEnviar(chatId, "▶️ Mensaje diario reactivado.");
        return NextResponse.json({ ok: true });
      }
      // Extraemos el archivo (si lo trae) y su tipo.
      const photos = msg.photo as Array<{ file_id: string }> | undefined;
      const media: { media_type: string; file_id: string } | null = msg.video
        ? { media_type: "video", file_id: msg.video.file_id }
        : msg.animation
        ? { media_type: "animation", file_id: msg.animation.file_id }
        : photos?.length
        ? { media_type: "photo", file_id: photos[photos.length - 1].file_id }
        : msg.document
        ? { media_type: "document", file_id: msg.document.file_id }
        : null;

      if (media) {
        await supabaseAdmin.from("telegram_daily").upsert({
          id: 1,
          media_type: media.media_type,
          file_id: media.file_id,
          caption: resto || null,
          enabled: true,
          updated_at: new Date().toISOString(),
        });
        await tgEnviar(
          chatId,
          "✅ Guardado como mensaje diario. Se enviará cada mañana a todos.\n\nCuando cambie, mándame otro /diario con el nuevo vídeo. Para pausar: /diario off."
        );
      } else if (resto) {
        await supabaseAdmin.from("telegram_daily").upsert({
          id: 1,
          media_type: "text",
          file_id: null,
          caption: resto,
          enabled: true,
          updated_at: new Date().toISOString(),
        });
        await tgEnviar(chatId, "✅ Guardado (texto) como mensaje diario.");
      } else {
        await tgEnviar(
          chatId,
          "Mándame /diario junto con el vídeo o foto (escribe /diario en el pie de la imagen), o /diario seguido de un texto."
        );
      }
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

    // ── Un JUGADOR escribe → la IA le responde sola + copia al dueño ─────────
    if (!esDueno) {
      // Recuperamos el historial para dar contexto a la IA.
      const { data: contacto } = await supabaseAdmin
        .from("telegram_contacts")
        .select("history")
        .eq("chat_id", chatId)
        .maybeSingle();
      const historial: Turno[] = Array.isArray(contacto?.history)
        ? (contacto!.history as Turno[])
        : [];

      // La IA responde (solo a texto; una foto sin texto se la pasamos al dueño).
      let respuesta: string | null = null;
      if (text && iaConfigurada()) {
        respuesta = await responderIA(historial, text);
      }

      // Guardamos actividad + alta + últimos turnos (máx 12 = 6 idas y vueltas).
      const nuevoHistorial: Turno[] = respuesta
        ? [
            ...historial,
            { role: "user" as const, content: text },
            { role: "assistant" as const, content: respuesta },
          ].slice(-12)
        : historial;
      await supabaseAdmin.from("telegram_contacts").upsert(
        {
          chat_id: chatId,
          first_name: from.first_name ?? null,
          username: from.username ?? null,
          last_msg_at: new Date().toISOString(),
          history: nuevoHistorial,
        },
        { onConflict: "chat_id" }
      );

      // Le mandamos la respuesta al jugador.
      if (respuesta) await tgEnviar(chatId, respuesta);

      // Copia al dueño para que veas la conversación y puedas intervenir.
      if (OWNER_CHAT_ID) {
        const quien =
          (from.first_name ?? "Jugador") +
          (from.username ? ` (@${from.username})` : "");
        const cuerpo = text
          ? ` pregunta:\n${text}` +
            (respuesta ? `\n\n🤖 <i>Respondí:</i>\n${respuesta}` : "")
          : " te ha enviado algo:";
        await tgEnviar(
          OWNER_CHAT_ID,
          `💬 <b>${quien}</b>${cuerpo}\n\n<i>↩️ Responde a este mensaje para escribirle tú · id:${chatId}</i>`
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
