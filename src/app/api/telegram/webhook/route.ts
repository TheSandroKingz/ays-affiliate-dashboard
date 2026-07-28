import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  tgEnviar,
  tgApi,
  OWNER_CHAT_ID,
  botonJugar,
  botonSoloJugar,
  guardarMsg,
  midDe,
  descargarFoto,
} from "@/lib/telegram";
import { responderIA, iaConfigurada } from "@/lib/telegramAI";

type Turno = { role: "user" | "assistant"; content: string };

// Margen de tiempo (el dueño puede lanzar un envío a todos con /todos).
export const maxDuration = 60;

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

  try {
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
        "¡Klk! 👋 Escríbeme aquí mismo tu duda y te ayudo al momento. 🔥"
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

    // ── El DUEÑO envía algo a TODOS ya: "/todos" con un vídeo/foto en el pie ─
    // (desde la galería, sin URL). También "/todos <texto>" para solo texto.
    const cmdTodos = (text || (msg.caption ?? "")).trim();
    if (esDueno && cmdTodos.toLowerCase().startsWith("/todos")) {
      const resto = cmdTodos.replace(/^\/todos\s*/i, "").trim();
      const phT = msg.photo as Array<{ file_id: string }> | undefined;
      const med: { t: string; id: string } | null = msg.video
        ? { t: "video", id: msg.video.file_id }
        : msg.animation
        ? { t: "animation", id: msg.animation.file_id }
        : phT?.length
        ? { t: "photo", id: phT[phT.length - 1].file_id }
        : msg.document
        ? { t: "document", id: msg.document.file_id }
        : null;
      if (!med && !resto) {
        await tgEnviar(
          chatId,
          "Mándame /todos con un vídeo o foto en el pie (desde la galería), o /todos seguido de un texto, y lo envío a todos."
        );
        return NextResponse.json({ ok: true });
      }
      const { data: cs } = await supabaseAdmin
        .from("telegram_contacts")
        .select("chat_id")
        .eq("opted_out", false)
        .eq("silenced", false);
      const ids = (cs ?? []).map((c) => c.chat_id as number);
      const boton = botonJugar();
      let env = 0;
      const bloq: number[] = [];
      for (let i = 0; i < ids.length; i += 25) {
        const tanda = ids.slice(i, i + 25);
        await Promise.all(
          tanda.map(async (cid) => {
            const p: Record<string, unknown> = med
              ? { chat_id: cid, caption: resto || undefined, reply_markup: boton }
              : { chat_id: cid, text: resto, reply_markup: boton, disable_web_page_preview: true };
            if (med?.t === "video") p.video = med.id;
            else if (med?.t === "animation") p.animation = med.id;
            else if (med?.t === "photo") p.photo = med.id;
            else if (med?.t === "document") p.document = med.id;
            const metodo = med
              ? med.t === "video" ? "sendVideo" : med.t === "animation" ? "sendAnimation" : med.t === "photo" ? "sendPhoto" : "sendDocument"
              : "sendMessage";
            const r = await tgApi(metodo, p);
            if (r?.ok) {
              env++;
              await guardarMsg(cid, midDe(r));
            } else if (r && /blocked|deactivated|kicked/i.test(r.description ?? "")) {
              bloq.push(cid);
            }
          })
        );
        if (i + 25 < ids.length) await new Promise((r) => setTimeout(r, 1000));
      }
      if (bloq.length) {
        await supabaseAdmin
          .from("telegram_contacts")
          .update({ opted_out: true })
          .in("chat_id", bloq);
      }
      await tgEnviar(chatId, `✅ Enviado a ${env} de ${ids.length}.`);
      return NextResponse.json({ ok: true });
    }

    // ── El DUEÑO responde a una duda reenviada → mandarla al jugador ─────────
    // Usamos copyMessage: copia TU respuesta tal cual (texto, foto, vídeo, gif…)
    // al jugador. Así puedes contestar con lo que quieras, no solo texto.
    if (esDueno && msg.reply_to_message?.text) {
      const m = msg.reply_to_message.text.match(/\[uid:(\d+)\]/);
      if (m) {
        const destino = Number(m[1]);
        const r = await tgApi("copyMessage", {
          chat_id: destino,
          from_chat_id: chatId,
          message_id: msg.message_id,
        });
        // Guardamos tu respuesta en la memoria del jugador (como "assistant"),
        // para que el bot NO te contradiga luego y siga el hilo de lo que dijiste.
        if (r?.ok && text) {
          await supabaseAdmin
            .from("telegram_messages")
            .insert({ chat_id: destino, role: "assistant", content: text })
            .then(() => {}, () => {});
        }
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
      // Datos del contacto: contador anti-spam, silencio y corte de memoria.
      const { data: contacto } = await supabaseAdmin
        .from("telegram_contacts")
        .select("ai_window_start, ai_count, silenced, memory_reset_at")
        .eq("chat_id", chatId)
        .maybeSingle();
      // Silenciado por el dueño: el bot lo ignora del todo.
      if (contacto?.silenced) return NextResponse.json({ ok: true });

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

      // ¿Pide el patrón/vídeo? Si hay vídeo guardado, se lo mandamos como "así
      // es como lo hago yo" (tu contenido/estilo). Sin decir que gana.
      let videoEnviado = false;
      const pidePatron =
        /patr[oó]n|cuadrad|cuadro|m[eé]todo|truco|sistema|c[oó]mo (le das|lo hac|juega)/i.test(
          text
        );
      if (pidePatron && !limitado) {
        const { data: dv } = await supabaseAdmin
          .from("telegram_daily")
          .select("media_type, file_id, enabled")
          .eq("id", 1)
          .maybeSingle();
        if (dv && dv.enabled && dv.file_id) {
          const m = dv.media_type;
          const metodo =
            m === "video" ? "sendVideo" : m === "animation" ? "sendAnimation" : m === "photo" ? "sendPhoto" : m === "document" ? "sendDocument" : "sendMessage";
          const p: Record<string, unknown> = {
            chat_id: chatId,
            caption: "Así es como le doy yo 🔥 dale y a jugar",
            reply_markup: botonSoloJugar(),
          };
          if (m === "video") p.video = dv.file_id;
          else if (m === "animation") p.animation = dv.file_id;
          else if (m === "photo") p.photo = dv.file_id;
          else if (m === "document") p.document = dv.file_id;
          const rv = await tgApi(metodo, p);
          if (rv?.ok) {
            await guardarMsg(chatId, midDe(rv));
            videoEnviado = true;
          }
        }
      }

      // Texto para la IA: si el jugador manda solo un vídeo/foto, dejamos
      // constancia para que el bot lo tenga en cuenta (no puede verlo, pero sabe
      // que lo ha mandado y no responde como si no hubiera pasado nada).
      const entrada =
        text ||
        (msg.video || msg.animation
          ? "[el jugador te ha enviado un vídeo]"
          : msg.photo
          ? "[el jugador te ha enviado una foto]"
          : msg.document
          ? "[el jugador te ha enviado un archivo]"
          : "");

      // Contexto REAL de la conversación: lo leemos del transcript completo
      // (telegram_messages), que solo AÑADE y nunca se pisa aunque lleguen dos
      // mensajes casi a la vez → el bot no "olvida" lo que le acaban de decir.
      // Respetamos el corte de "Reiniciar memoria" (memory_reset_at).
      const desde = contacto?.memory_reset_at ?? "1970-01-01T00:00:00Z";
      const { data: prev } = await supabaseAdmin
        .from("telegram_messages")
        .select("role, content")
        .eq("chat_id", chatId)
        .gt("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(24);
      const historial: Turno[] = ((prev ?? []) as { role: string; content: string }[])
        .reverse()
        .filter((m) => (m.role === "user" || m.role === "assistant") && !!m.content)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      // Guardamos YA el mensaje del jugador (antes de responder): si manda otro
      // mensaje seguido, ese contexto ya estará disponible para el segundo.
      await supabaseAdmin
        .from("telegram_messages")
        .insert({ chat_id: chatId, role: "user", content: entrada || "(envió algo)" })
        .then(() => {}, () => {});

      // La IA responde (si no está limitada por spam ni por el tope global diario).
      const TOPE_DIA = 5000;
      let respuesta: string | null = null;
      if (entrada && iaConfigurada() && !limitado && !videoEnviado) {
        // "Escribiendo…" al instante para que se vea movimiento mientras la IA
        // piensa (Telegram lo muestra ~5s). No bloquea si falla.
        tgApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(
          () => {}
        );
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
          // Si mandó una foto, la descargamos y se la pasamos a la IA con visión
          // (la mira de verdad: saldo de bono en rojo, Mines, error, etc.).
          const fotos = msg.photo as Array<{ file_id: string }> | undefined;
          const imagen =
            fotos && fotos.length
              ? await descargarFoto(fotos[fotos.length - 1].file_id)
              : null;
          respuesta = await responderIA(
            historial,
            entrada,
            imagen,
            from.first_name ?? null
          );
          if (respuesta) {
            await supabaseAdmin
              .from("telegram_ai_daily")
              .upsert({ day: hoy, count: usoActual + 1 });
          }
        }
      }

      // Actualizamos actividad y contadores anti-spam (la memoria de la charla
      // vive en telegram_messages, no aquí).
      await supabaseAdmin.from("telegram_contacts").upsert(
        {
          chat_id: chatId,
          first_name: from.first_name ?? null,
          username: from.username ?? null,
          last_msg_at: new Date().toISOString(),
          ai_window_start: aiWindow,
          ai_count: aiCount,
        },
        { onConflict: "chat_id" }
      );

      // Respuesta al jugador. Texto plano (sin HTML): la IA podría meter un "<".
      // El botón del enlace solo sale cuando la respuesta invita a jugar/entrar
      // /depositar (si no, cansa verlo en cada mensajito).
      // Guardamos el mensaje del jugador para la limpieza automática de chats.
      await guardarMsg(chatId, msg.message_id);
      if (respuesta) {
        const invita =
          /jug|entra|deposit|recarg|vuelve|\b20\b|enlace|link|registr|apuest/i.test(
            respuesta
          );
        const rEnv = await tgEnviar(chatId, respuesta, {
          parse_mode: undefined,
          ...(invita ? { reply_markup: botonSoloJugar() } : {}),
        });
        await guardarMsg(chatId, midDe(rEnv));
      } else if (entrada && !limitado && !videoEnviado) {
        // Si la IA falla (no por spam), no dejamos al jugador sin nada.
        const rEnv = await tgEnviar(chatId, "¡Dale! 🔥 Recarga y entra a jugar 👇", {
          reply_markup: botonSoloJugar(),
        });
        await guardarMsg(chatId, midDe(rEnv));
      }

      // Guardamos la respuesta del bot en el transcript (el mensaje del jugador
      // ya se guardó antes de responder, arriba).
      if (respuesta || videoEnviado) {
        await supabaseAdmin
          .from("telegram_messages")
          .insert({
            chat_id: chatId,
            role: "assistant",
            content: respuesta || "(le envié el vídeo: así juego yo)",
          })
          .then(() => {}, () => {});
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
