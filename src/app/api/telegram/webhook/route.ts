import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tgEnviar, tgApi, OWNER_CHAT_ID, botonJugar, botonSoloJugar } from "@/lib/telegram";
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

// Escapa los caracteres que Telegram interpreta como HTML, para meter texto de
// usuarios (nombres, mensajes) dentro de un mensaje con formato sin romperlo.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ⚠️ EDITA AQUÍ el mensaje de bienvenida (el "gancho" que ve al unirse):
const BIENVENIDA =
  "¡Hey, bienvenido! 👋🔥\n\n" +
  "Aquí te voy pasando <b>vídeos, promos y tips</b> para que estés al día. 🎰\n\n" +
  "Cualquier duda me escribes por aquí y te ayudo al momento. ¡Dale que esto se pone bueno! 💪\n\n" +
  "<i>(si no quieres recibir mensajes, escribe /stop)</i>";

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

  // ── Anti-duplicados: si Telegram reintenta el mismo update, lo ignoramos ──
  const updateId = update?.update_id;
  if (typeof updateId === "number") {
    const { data: ins, error } = await supabaseAdmin
      .from("telegram_updates")
      .upsert({ update_id: updateId }, { onConflict: "update_id", ignoreDuplicates: true })
      .select("update_id");
    if (!error && ins && ins.length === 0) {
      return NextResponse.json({ ok: true }); // ya procesado antes
    }
  }

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
      // Bienvenida: con vídeo/foto si el dueño lo puso (/bienvenida), si no texto.
      const { data: bienv } = await supabaseAdmin
        .from("telegram_welcome")
        .select("media_type, file_id, enabled")
        .eq("id", 1)
        .maybeSingle();
      const boton = botonJugar();
      if (bienv && bienv.enabled && bienv.file_id) {
        const m = bienv.media_type;
        const metodo =
          m === "video" ? "sendVideo" : m === "animation" ? "sendAnimation" : m === "photo" ? "sendPhoto" : m === "document" ? "sendDocument" : "sendMessage";
        const params: Record<string, unknown> = { chat_id: chatId, caption: BIENVENIDA, parse_mode: "HTML", reply_markup: boton };
        if (m === "video") params.video = bienv.file_id;
        else if (m === "animation") params.animation = bienv.file_id;
        else if (m === "photo") params.photo = bienv.file_id;
        else if (m === "document") params.document = bienv.file_id;
        await tgApi(metodo, params);
      } else {
        await tgEnviar(chatId, BIENVENIDA, { reply_markup: boton });
      }
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

    // ── El DUEÑO configura el VÍDEO DE BIENVENIDA ───────────────────────────
    // "/bienvenida" con un vídeo/foto en el pie → se envía con cada /start.
    const cmdBienv = (text || (msg.caption ?? "")).trim();
    if (esDueno && cmdBienv.toLowerCase().startsWith("/bienvenida")) {
      const resto = cmdBienv.replace(/^\/bienvenida\s*/i, "").trim();
      if (/^off$/i.test(resto)) {
        await supabaseAdmin
          .from("telegram_welcome")
          .upsert({ id: 1, enabled: false, updated_at: new Date().toISOString() });
        await tgEnviar(chatId, "⏸️ Vídeo de bienvenida quitado (la bienvenida volverá a ir en solo texto).");
        return NextResponse.json({ ok: true });
      }
      const photosB = msg.photo as Array<{ file_id: string }> | undefined;
      const mediaB: { media_type: string; file_id: string } | null = msg.video
        ? { media_type: "video", file_id: msg.video.file_id }
        : msg.animation
        ? { media_type: "animation", file_id: msg.animation.file_id }
        : photosB?.length
        ? { media_type: "photo", file_id: photosB[photosB.length - 1].file_id }
        : msg.document
        ? { media_type: "document", file_id: msg.document.file_id }
        : null;
      if (mediaB) {
        await supabaseAdmin.from("telegram_welcome").upsert({
          id: 1,
          media_type: mediaB.media_type,
          file_id: mediaB.file_id,
          enabled: true,
          updated_at: new Date().toISOString(),
        });
        await tgEnviar(chatId, "✅ Guardado como vídeo de bienvenida. Los nuevos lo verán al darle /start. Para quitarlo: /bienvenida off.");
      } else {
        await tgEnviar(chatId, "Mándame /bienvenida junto con el vídeo o foto (escribe /bienvenida en el pie de la imagen).");
      }
      return NextResponse.json({ ok: true });
    }

    // ── El DUEÑO responde a una duda reenviada → mandarla al jugador ─────────
    // Usamos copyMessage: copia TU respuesta tal cual (texto, foto, vídeo, gif…)
    // al jugador. Así puedes contestar con lo que quieras, no solo texto.
    if (esDueno && msg.reply_to_message?.text) {
      const m = msg.reply_to_message.text.match(/\[uid:(\d+)\]/);
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
      // Recuperamos el historial (para contexto) y el contador anti-spam.
      const { data: contacto } = await supabaseAdmin
        .from("telegram_contacts")
        .select("history, ai_window_start, ai_count, silenced")
        .eq("chat_id", chatId)
        .maybeSingle();
      // Silenciado por el dueño: el bot lo ignora del todo.
      if (contacto?.silenced) return NextResponse.json({ ok: true });
      const historial: Turno[] = Array.isArray(contacto?.history)
        ? (contacto!.history as Turno[])
        : [];

      // Límite: máx 8 respuestas de IA por minuto por usuario (protege el saldo
      // de Claude de que alguien spamee el bot).
      const LIMITE_IA = 8;
      const ahoraMs = Date.now();
      const winMs = contacto?.ai_window_start
        ? new Date(contacto.ai_window_start).getTime()
        : 0;
      let aiCount = contacto?.ai_count ?? 0;
      let aiWindow = contacto?.ai_window_start ?? null;
      if (ahoraMs - winMs > 60_000) {
        aiCount = 0;
        aiWindow = new Date().toISOString();
      }
      aiCount += 1;
      const limitado = aiCount > LIMITE_IA;

      // La IA responde (solo a texto, si no está limitado por spam ni por el
      // tope global diario, que es solo un freno anti-ataque, muy alto).
      const TOPE_DIA = 5000;
      let respuesta: string | null = null;
      if (text && iaConfigurada() && !limitado) {
        const hoy = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid",
        }).format(new Date());
        const { data: usoDia } = await supabaseAdmin
          .from("telegram_ai_daily")
          .select("count")
          .eq("day", hoy)
          .maybeSingle();
        const usoActual = usoDia?.count ?? 0;
        if (usoActual < TOPE_DIA) {
          respuesta = await responderIA(historial, text);
          if (respuesta) {
            await supabaseAdmin
              .from("telegram_ai_daily")
              .upsert({ day: hoy, count: usoActual + 1 });
          }
        }
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
          ai_window_start: aiWindow,
          ai_count: aiCount,
        },
        { onConflict: "chat_id" }
      );

      // Respuesta al jugador. Texto plano (sin HTML): la IA podría meter un "<".
      // El botón del enlace solo sale cuando la respuesta invita a jugar/entrar
      // /depositar (si no, cansa verlo en cada mensajito).
      if (respuesta) {
        const invita = /jug|entra|deposit|\b20\b|enlace|link|registr|apuest/i.test(
          respuesta
        );
        await tgEnviar(chatId, respuesta, {
          parse_mode: undefined,
          ...(invita ? { reply_markup: botonSoloJugar() } : {}),
        });
      } else if (text && !limitado) {
        // Si la IA falla (no por spam), no dejamos al jugador sin nada.
        await tgEnviar(chatId, "¡Dale! 🔥 Mete 20€ y entra a jugar 👇", {
          reply_markup: botonSoloJugar(),
        });
      }

      // Copia al dueño para que veas la conversación y puedas intervenir.
      if (OWNER_CHAT_ID) {
        const quien = esc(
          (from.first_name ?? "Jugador") +
            (from.username ? ` (@${from.username})` : "")
        );
        const cuerpo = text
          ? ` pregunta:\n${esc(text)}` +
            (respuesta ? `\n\n🤖 <i>Respondí:</i>\n${esc(respuesta)}` : "")
          : " te ha enviado algo:";
        await tgEnviar(
          OWNER_CHAT_ID,
          `💬 <b>${quien}</b>${cuerpo}\n\n<i>↩️ Responde a este mensaje para escribirle tú</i> [uid:${chatId}]`
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
