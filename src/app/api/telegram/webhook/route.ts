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
  ENLACES_PAUSADOS,
} from "@/lib/telegram";
import { compararSecreto } from "@/lib/secreto";
import { rateLimitShared } from "@/lib/rateLimit";
import { responderIA, iaConfigurada, marcaHueco, esSoloCierre, ABUSO_RE } from "@/lib/telegramAI";
import { enviarPush, quiereNotif } from "@/lib/push";
import { YAIZA_ID } from "@/lib/adminId";

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
  "Ese vídeo de ahí arriba es <b>mi patrón de las Mines</b> — así es como le doy yo 🎰. Míralo bien y hazlo IGUAL, dale y a por ello 💪\n\n" +
  "Por aquí te voy pasando el <b>patrón, vídeos, promos y tips</b> cada día, así que mantente atento. Cualquier duda me escribes y te ayudo al momento. ¡Dale que esto se pone bueno! 🔥\n\n" +
  "<i>(si no quieres recibir mensajes, escribe /stop)</i>";

// ── ANTI-TROLL: INSULTO PERSONAL dirigido al bot (no un taco de frustración del
// juego, ni una queja legítima de un pago). ⚠️ OJO: NO metemos aquí "estafa",
// "denunciar", "guardia civil", "reportar"… porque son las palabras que usa un
// jugador CABREADO pero LEGÍTIMO con un retiro que no le llega ("esto es una
// estafa, no me llega el dinero, voy a denunciar") — a ese hay que AYUDARLE, no
// silenciarlo. Solo cuentan los insultos personales claros. A los 2 (aviso + reincidencia), se silencia.
// ABUSO_RE ahora vive en telegramAI (compartido con los bots Jeffer/Livana).

export async function POST(request: Request) {
  // Verificación del secreto del webhook (comparación en tiempo constante).
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!compararSecreto(secret, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: true }); // 200 silencioso, no procesamos
  }

  try {
  const update = await request.json().catch(() => null);

  // ── Anti-duplicados: si Telegram reintenta el mismo update, lo ignoramos ──
  // OJO: marcamos el update ANTES de procesar (evita responder 2 veces a reintentos
  // casi simultáneos). Pero si un intento anterior se quedó a medias (timeout de la
  // IA, reciclado de instancia) y NUNCA respondió, un reintento de Telegram no debe
  // descartarse para siempre o el jugador se queda sin respuesta. Solución: si el
  // update ya existía pero es ANTIGUO (más que lo máximo que puede durar la función),
  // asumimos que aquel intento murió y RE-procesamos; si es reciente, lo saltamos.
  const updateId = update?.update_id;
  if (typeof updateId === "number") {
    const { data: ins, error } = await supabaseAdmin
      .from("telegram_updates")
      .upsert({ update_id: updateId }, { onConflict: "update_id", ignoreDuplicates: true })
      .select("update_id");
    if (!error && ins && ins.length === 0) {
      const { data: prev } = await supabaseAdmin
        .from("telegram_updates")
        .select("created_at")
        .eq("update_id", updateId)
        .maybeSingle();
      const antiguoMs = prev?.created_at
        ? Date.now() - new Date(prev.created_at).getTime()
        : 0;
      const REPROCESAR_TRAS = 120_000; // 120s > duración máx. de la función → sin doble respuesta
      if (antiguoMs < REPROCESAR_TRAS) {
        return NextResponse.json({ ok: true }); // duplicado reciente → no re-responder
      }
      // Intento antiguo que murió sin responder: re-reclamamos y seguimos.
      await supabaseAdmin
        .from("telegram_updates")
        .update({ created_at: new Date().toISOString() })
        .eq("update_id", updateId);
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
        const rb = await tgApi(metodo, params);
        // Si el file_id está muerto (p.ej. subido con otro bot), Telegram devuelve
        // ok:false y el nuevo jugador se quedaría SIN bienvenida ni botón → caemos
        // al texto para no perder el gancho/conversión.
        if (!rb?.ok) {
          await tgEnviar(chatId, BIENVENIDA, { reply_markup: boton });
        }
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

    // ── "/ejemplo" con un vídeo/foto en el pie → se AÑADE a la biblioteca de
    // ejemplos ("así juego yo"). El bot manda uno DISTINTO (rotando) cuando piden
    // el patrón o dicen que una forma les falló. "/ejemplos" = cuántos hay.
    // "/ejemplos borrar" = vaciar. Es contenido REAL del dueño, no patrones.
    const cmdEj = (text || (msg.caption ?? "")).trim();
    if (esDueno && /^\/ejemplos?\b/i.test(cmdEj)) {
      const resto = cmdEj.replace(/^\/ejemplos?\s*/i, "").trim();
      if (/^(borrar|vaciar|reset)/i.test(resto)) {
        await supabaseAdmin.from("telegram_examples").delete().gt("id", 0);
        await tgEnviar(chatId, "🗑️ Biblioteca de ejemplos vaciada.");
        return NextResponse.json({ ok: true });
      }
      const photosE = msg.photo as Array<{ file_id: string }> | undefined;
      const mediaE: { media_type: string; file_id: string } | null = msg.video
        ? { media_type: "video", file_id: msg.video.file_id }
        : msg.animation
        ? { media_type: "animation", file_id: msg.animation.file_id }
        : photosE?.length
        ? { media_type: "photo", file_id: photosE[photosE.length - 1].file_id }
        : msg.document
        ? { media_type: "document", file_id: msg.document.file_id }
        : null;
      const contar = async () => {
        const { count } = await supabaseAdmin
          .from("telegram_examples")
          .select("id", { count: "exact", head: true })
          .eq("enabled", true);
        return count ?? 0;
      };
      if (mediaE) {
        await supabaseAdmin
          .from("telegram_examples")
          .insert({ media_type: mediaE.media_type, file_id: mediaE.file_id });
        await tgEnviar(
          chatId,
          `✅ Ejemplo añadido. Ya tienes ${await contar()} guardados. El bot irá mandando uno distinto cuando pidan el patrón o digan que una forma les falló. Manda más con /ejemplo. Para vaciar: /ejemplos borrar.`
        );
      } else {
        await tgEnviar(
          chatId,
          `Tienes ${await contar()} ejemplos guardados. Para añadir uno: mándame /ejemplo junto con el vídeo o foto (escribe /ejemplo en el pie). Para vaciar: /ejemplos borrar.`
        );
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
      // Paginado: PostgREST corta a 1000 filas. Sin esto, a partir del contacto
      // 1000 nadie recibiría el envío masivo y el resumen "Enviado a X de Y" lo
      // ocultaría (Y≤1000). Traemos TODOS en páginas de 1000.
      const ids: number[] = [];
      for (let off = 0; ; off += 1000) {
        const { data: cs } = await supabaseAdmin
          .from("telegram_contacts")
          .select("chat_id")
          .eq("opted_out", false)
          .eq("silenced", false)
          .range(off, off + 999);
        const tanda = (cs ?? []).map((c) => c.chat_id as number);
        ids.push(...tanda);
        if (tanda.length < 1000) break;
      }
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
    // El marcador [uid:N] puede venir en el texto o en el PIE (caption) del
    // mensaje al que respondes (si respondes a una foto/vídeo reenviado).
    const refDueno =
      msg.reply_to_message?.text || msg.reply_to_message?.caption;
    if (esDueno && refDueno) {
      // SEGURIDAD: cogemos el ÚLTIMO [uid:N] (el que añade el servidor va SIEMPRE
      // al final). Así, si un jugador mete un "[uid:otro]" en su texto para
      // desviar tu respuesta a otra persona, no cuela.
      const marcadores = [...refDueno.matchAll(/\[uid:(\d+)\]/g)];
      const m = marcadores[marcadores.length - 1];
      if (m) {
        const destino = Number(m[1]);
        const r = await tgApi("copyMessage", {
          chat_id: destino,
          from_chat_id: chatId,
          message_id: msg.message_id,
        });
        // Guardamos tu respuesta en la memoria del jugador (como "assistant"),
        // para que el bot NO te contradiga luego y siga el hilo de lo que dijiste.
        // Si respondes con foto/vídeo (sin texto), guardamos su pie o un aviso.
        if (r?.ok) {
          const contenidoDueno =
            text || msg.caption || "(el dueño le envió una imagen/vídeo)";
          await supabaseAdmin
            .from("telegram_messages")
            .insert({ chat_id: destino, role: "assistant", content: contenidoDueno })
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
      // Datos del contacto: silencio, corte de memoria y última vez que habló.
      const { data: contacto } = await supabaseAdmin
        .from("telegram_contacts")
        .select("silenced, memory_reset_at, last_example_at, last_msg_at")
        .eq("chat_id", chatId)
        .maybeSingle();
      // Silenciado por el dueño: el bot lo ignora del todo.
      if (contacto?.silenced) return NextResponse.json({ ok: true });

      // Aviso push "ha hablado alguien" SOLO para Yaiza (gestiona el bot desde
      // la web). Al admin NO se le avisa de cada charla: a él solo le llegan los
      // FTD. Anti-spam: solo si es un contacto NUEVO o si llevaba +15 min callado
      // — así avisa de conversaciones que empiezan, no de cada mensaje de una
      // charla en curso. Blindado: nunca rompe el webhook.
      try {
        const prev = contacto?.last_msg_at ? Date.parse(contacto.last_msg_at) : 0;
        const conversacionNueva = !prev || Date.now() - prev > 15 * 60_000;
        if (conversacionNueva && (await quiereNotif(YAIZA_ID, "bot_msg"))) {
          const quien = from.first_name || from.username || "Alguien";
          await enviarPush(YAIZA_ID, {
            title: "💬 Han escrito al bot",
            body: `${quien} está hablando con el bot. Entra a leerlo.`,
            url: "/dashboard/bot",
            tag: "bot-msg",
          });
        }
      } catch {
        /* nunca romper el webhook por una notificación */
      }

      // Límite: máx 15 mensajes por minuto por usuario (protege el saldo de
      // Claude y evita floods). ATÓMICO en BD: una ráfaga concurrente del mismo
      // usuario no puede saltárselo. Si la función aún no existe (SQL sin aplicar),
      // no bloquea. Subido de 8 a 15: un jugador ansioso que parte su duda en
      // varios mensajes cortos (cada uno cuenta, aunque el debounce agrupe la
      // respuesta) no debe quedarse sin respuesta ni sin copia al dueño; un flood
      // real (decenas/min) sí se corta.
      const LIMITE_IA = 15;
      const { data: nUsuario } = await supabaseAdmin.rpc("bump_ai_user", {
        p_chat_id: chatId,
        p_ventana_ms: 60_000,
      });
      const limitado = typeof nUsuario === "number" && nUsuario > LIMITE_IA;

      // ¿Pide el patrón/vídeo? Si hay vídeo guardado, se lo mandamos como "así
      // es como lo hago yo" (tu contenido/estilo). Sin decir que gana.
      // Texto del jugador INCLUYENDO el pie de foto/vídeo: en Telegram el texto
      // que acompaña a una imagen va en msg.caption, no en msg.text. Sin esto el
      // bot ignoraba lo que la gente escribe junto a la foto (y lo perdía de la
      // memoria). Así lee la imagen Y lo que dice sobre ella.
      const textoJ = text || (msg.caption ?? "").trim();

      // ── ANTI-TROLL: si INSULTA al bot o AMENAZA (denunciar, guardia civil,
      // "estafador"…) de forma PERSISTENTE, dejamos de contestarle para no gastar
      // IA con él. A los 3 mensajes abusivos se auto-silencia; el dueño puede
      // quitarle el silencio a mano desde el panel. Un taco suelto NO lo silencia.
      if (textoJ && ABUSO_RE.test(textoJ)) {
        const { data: prevAbuso } = await supabaseAdmin
          .from("telegram_messages")
          .select("content")
          .eq("chat_id", chatId)
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(12);
        const nAbuso =
          1 +
          (prevAbuso ?? []).filter((m) =>
            ABUSO_RE.test(String(m.content ?? ""))
          ).length;
        if (nAbuso >= 2) {
          await supabaseAdmin
            .from("telegram_contacts")
            .update({ silenced: true })
            .eq("chat_id", chatId);
          if (OWNER_CHAT_ID) {
            await tgEnviar(
              String(OWNER_CHAT_ID),
              `🔇 Silenciado ${esc(from.first_name ?? "un usuario")} (chat ${chatId}): lleva varios insultos/amenazas, dejé de contestarle para no gastar IA. Para reactivarlo, quítale el silencio en el panel.`
            ).catch(() => {});
          }
          return NextResponse.json({ ok: true, silenced: "troll" });
        }
      }

      let videoEnviado = false;
      let videoEnviadoFileId: string | null = null; // para reproducirlo en el panel
      let videoEnviadoTipo: string | null = null;
      // Detecta que piden el patrón/método O que piden VER el vídeo o están
      // esperándolo (para no dejarlos colgados esperando: se lo mandamos).
      // Detecta que piden EL PATRÓN o piden VER el vídeo de forma clara. Ojo:
      // exigimos que "vídeo" vaya junto a una palabra de petición para NO
      // dispararse con quejas ("problema con el sistema de pago", "no me llega el
      // vídeo") ni silenciar a la IA cuando la persona necesita ayuda.
      const pidePatron =
        /patr[oó]n|estrateg|cuadrad|cuadro|\btruco|\btips?\b|(?<!por )ejemplo|c[oó]mo (le das|lo hac|juega|jueg[oa])|(ens[eé][ñn]a|mu[eé]stra|m[aá]nd|env[ií]|p[aá]s|dame|tienes|hay|quiero ver|quiero un|ver el|ver un|en cu[aá]l|d[oó]nde|esperando)\w*[^.\n]{0,15}v[ií]deos?/i.test(
          textoJ
        );
      const mandoVideo = !!(msg.video || msg.animation);
      // Dice que el patrón / una forma NO le va, le falla, le salen bombas, etc.
      const falloForma =
        /no me (va|funciona|sal|tir|acier|sirv)|no funciona|no va|me falla|fall[oó]|pet[oó]|\bpeta\b|no acierto|salen? bomba|me sale bomba|explot|no gano|otra forma|otro ejemplo/i.test(
          textoJ
        );
      // Negación: si DICE que NO quiere el vídeo/ejemplo ("no me mandes el vídeo",
      // "deja de mandarme el clip"), NO cuenta como petición ni salta candados.
      const negPide =
        /\b(no|nunca|ya no|deja de|para de|dejad? de|dej[eé]is de|dejes de)\b\s*(?:(?:me|te|lo|la|los|las|melo|mela)\s*){0,2}(m[aá]nd|env[ií]|p[aá]s|reenv|repit|manda|quiero (?:el|un|ver))\w*/i.test(textoJ);
      // Pide OTRO/MÁS ejemplo explícitamente → se lo mandamos aunque haya cooldown.
      const pideOtro =
        /(otro|otra|m[aá]s|siguiente)\s*(ejemplo|forma|v[ií]deo|truco|patr[oó]n)|otro ejemplo|otra forma/i.test(
          textoJ
        ) && !negPide;
      // Reenvío EXPLÍCITO = pide el vídeo/patrón OTRA VEZ (con señal clara de "de
      // nuevo"). "pásame un patrón" a secas NO es reenvío (1ª petición normal) y NO
      // debe saltar el candado anti-doble; si no, mandaba el vídeo dos veces al
      // pedirlo dos veces seguidas.
      const reenvioExplicito =
        /(otra vez|de nuevo|de vuelta|nuevamente|reenv[ií]|rep[ií]t|vu[eé]lve a|m[aá]ndamelo otra)/i.test(textoJ) &&
        /(v[ií]deo|patr[oó]n|clip|ejemplo|m[aá]ndamelo|p[aá]samelo|reenv[ií]amelo|env[ií]amelo|m[aá]ndamela|p[aá]samela)/i.test(textoJ) &&
        !negPide;
      // Pregunta CONCEPTUAL/escéptica sobre el patrón ("¿tiene sentido?", "¿funciona
      // de verdad?", "¿es mentira?", "¿vale la pena?"): quiere una RESPUESTA, no un
      // vídeo mudo. No dispares el clip aquí; deja que la IA conteste (evita que el
      // jugador tenga que escribir "responde" tras recibir el vídeo sin contestación).
      // Peticion EXPLICITA de envio ("mandame/pasame/dame el video/patron"): aunque
      // lleve "?", NO es duda conceptual -> debe recibir el recurso.
      // ⚠️ El verbo de envío (mánd/enví/pás/dame…) SOLO cuenta si va junto a
      // "vídeo/patrón/clip/ejemplo". Si no, "pasará", "he enviado el mensaje", "me
      // pasa algo", "dame un momento" disparaban el vídeo (¡encima de un problema
      // de retiro!). Con el objeto exigido, solo salta en peticiones reales.
      const pideEnvioExplicito =
        ((/\b(m[aá]nd|env[ií]|p[aá]s|dame|reenv|quiero (el|un|ver))\w*/i.test(textoJ) &&
          /(v[ií]deo|patr[oó]n|clip|ejemplo)/i.test(textoJ)) ||
       /\b(das|tienes|ten[eé]s|hay|d[oó]nde)\b[^.\n]{0,20}(v[ií]deo|patr[oó]n|clip|ejemplo)/i.test(textoJ)) && !negPide;
      const dudaConceptoPatron =
        /sentido real|(tiene|hay)\s+(alg[uú]n\s+)?(sentido|ventaja|l[oó]gica)|(es|ser[ií]a|era|sea)\s+(mentira|real|verdad|estafa|fake|timo|cuento)|(de verdad|realmente|en serio)\s+(funciona|gana|sirve|va\b)|(funciona|gana|sirve)\s+(de verdad|realmente|siempre|o no\b|o es)|vale la pena|merece la pena|ventaja matem|probabilidad|es\s+(una\s+)?estafa|es\s+(seguro|fiable|de fiar)|puedo\s+(ganar|retirar|perder|confiar|fiarme)|\bpor\s?qu[eé]\b|c[oó]mo\s+(funciona|gana)|\?/i.test(textoJ) && !pideEnvioExplicito;
      // Petición sobre un patrón FUTURO/NUEVO o CAMBIAR el patrón: NO es pedir ver el
      // actual → NO auto-enviamos el vídeo; que responda la IA a esa petición concreta.
      const patronFuturoOCambio =
        /(av[ií]sa\w*|me avisas|avisadme)[^.\n]{0,30}(patr[oó]n|\bz\b|m[eé]todo)|cuando\s+(haya|salga|saques|tengas|exista|pongas|est[eé]|subas|cambi\w*|haga[sn]?)[^.\n]{0,25}(patr[oó]n|\bz\b|m[eé]todo)|patr[oó]n\s+(nuevo|distinto|diferente)|nuevo\s+patr[oó]n|cambi\w*\s+(de\s+|el\s+|mi\s+|tu\s+)?patr/i.test(textoJ);
      // Problema REAL (pagos, cuenta, verificación, bono…): eso va a la IA, NO se
      // le manda un ejemplo. Incluye el error de saldo de bono ("can not make a bet").
      const problemaReal =
        /retir|cobr|\bpag(?:o|u|ar|a\b|as\b|and|ad)|dep[oó]sito|\bcuentas?\b|verific|bloque|correo|email|bono|bonus|can ?not|make a bet|saldo|reclamaci|estafa/i.test(
          textoJ
        );
      // COOLDOWN corto (20 min): no repetir el vídeo a cada mensaje, pero sí mandar
      // varios en una charla (antes 6h y "no mandaba" cuando pedían). Si piden OTRO
      // explícitamente, se salta el cooldown.
      const COOLDOWN_EJEMPLO_MS = 20 * 60 * 1000;
      const msDesdeEjemplo = contacto?.last_example_at
        ? Date.now() - new Date(contacto.last_example_at as string).getTime()
        : Infinity;
      const ejemploReciente = msDesdeEjemplo < COOLDOWN_EJEMPLO_MS;
      // "Justo antes": vídeo hace <3 min → NUNCA otro seguido (ni pidiendo "otro").
      const ejemploJustoAntes = msDesdeEjemplo < 3 * 60 * 1000;
      if (
        !ENLACES_PAUSADOS &&
        // SOLO cuando lo PIDEN (patrón/vídeo/otro). NO en automático ante una duda
        // ni cuando dicen que PIERDEN/no les va: ahí, respuesta personalizada.
        // Nombrar el patrón DENTRO de una queja (falloForma) NO cuenta como petición;
        // un reenvío EXPLÍCITO ("mándamelo otra vez") sí abre el envío.
        ((((pidePatron || pideEnvioExplicito) && !falloForma && !dudaConceptoPatron) || pideOtro || reenvioExplicito) && !patronFuturoOCambio) &&
        !problemaReal &&
        !limitado &&
        // No dos vídeos seguidos ante una DUDA; pero si lo piden EXPLÍCITAMENTE, sí.
        (!ejemploJustoAntes || reenvioExplicito) &&
        (!ejemploReciente || pideOtro || reenvioExplicito)
      ) {
        // Vídeo a mandar. Si PIDEN el patrón (p. ej. "el patrón nuevo"), mandamos
        // SIEMPRE el vídeo del DIARIO = el patrón ACTUAL que el dueño dejó en
        // "información". Así quien tenga un patrón viejo recibe el de AHORA. Para
        // "otra forma" (les falló, o mandan su jugada) rotamos por la biblioteca
        // de ejemplos. En ambos casos, si falta la fuente, caemos a las otras.
        // "Piden el patrón" (y NO es un caso de otra-forma / su vídeo) → el DIARIO
        // (el patrón actual de "información") primero. El resto → ejemplos primero.
        const pidenPatronNuevo = pidePatron && !falloForma && !mandoVideo;
        // Candidatos a enviar, con su ORIGEN (para poder auto-desactivar el que
        // Telegram rechace). Probamos EN ORDEN hasta que UNO se envíe: si un
        // file_id está muerto (típico cuando el vídeo se subió con OTRO bot; en
        // Telegram los file_id son intransferibles), se salta al siguiente en vez
        // de dejar al jugador solo con el enlace. Los ejemplos con file_id inválido
        // se AUTO-DESACTIVAN para no reintentarlos.
        type Cand = { src: "daily" | "example" | "welcome"; id: number | null; media_type: string | null; file_id: string | null };
        const examples: Cand[] = [];
        {
          const { data: ejs } = await supabaseAdmin
            .from("telegram_examples")
            .select("id, media_type, file_id")
            .eq("enabled", true)
            .limit(200); // biblioteca curada por el dueño (decenas); tope holgado
          for (const e of (ejs ?? []) as { id: number; media_type: string | null; file_id: string | null }[])
            examples.push({ src: "example", id: e.id, media_type: e.media_type, file_id: e.file_id });
          for (let i = examples.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [examples[i], examples[j]] = [examples[j], examples[i]];
          }
        }
        const cargarDaily = async (): Promise<Cand | null> => {
          const { data } = await supabaseAdmin
            .from("telegram_daily").select("media_type, file_id, enabled").eq("id", 1).maybeSingle();
          return data && data.enabled && data.file_id
            ? { src: "daily", id: 1, media_type: data.media_type, file_id: data.file_id } : null;
        };
        const cargarBienv = async (): Promise<Cand | null> => {
          const { data } = await supabaseAdmin
            .from("telegram_welcome").select("media_type, file_id, enabled").eq("id", 1).maybeSingle();
          return data && data.enabled && data.file_id
            ? { src: "welcome", id: 1, media_type: data.media_type, file_id: data.file_id } : null;
        };
        const [daily, bienv] = await Promise.all([cargarDaily(), cargarBienv()]);
        const cands: Cand[] = pidenPatronNuevo
          ? [daily, ...examples, bienv].filter(Boolean) as Cand[]
          : [...examples, daily, bienv].filter(Boolean) as Cand[];

        const caption = pidenPatronNuevo
          ? "Este es el patrón que va AHORA 🔥 usa este, míralo y hazlo IGUAL. Si tienes uno más viejo, ese ya no vale."
          : (mandoVideo || falloForma)
          ? "Toma, prueba así también 🔥 es OTRA de mis formas. Tengo varias — mándame cómo te va y te paso la siguiente. Míralo y hazlo igual."
          : "Aquí tienes 🔥 así le doy yo. Tengo varias formas; hazlo igual que en esta y si acaso me enseñas cómo te fue y te paso otra.";
        for (const dv of cands) {
          if (!dv.file_id) continue;
          const m = dv.media_type;
          const metodo =
            m === "video" ? "sendVideo" : m === "animation" ? "sendAnimation" : m === "photo" ? "sendPhoto" : m === "document" ? "sendDocument" : "sendMessage";
          const p: Record<string, unknown> = { chat_id: chatId, caption, reply_markup: botonSoloJugar() };
          if (m === "video") p.video = dv.file_id;
          else if (m === "animation") p.animation = dv.file_id;
          else if (m === "photo") p.photo = dv.file_id;
          else if (m === "document") p.document = dv.file_id;
          const rv = await tgApi(metodo, p);
          if (rv?.ok) {
            await guardarMsg(chatId, midDe(rv));
            videoEnviado = true;
            videoEnviadoFileId = dv.file_id;
            videoEnviadoTipo = m ?? "video";
            await supabaseAdmin
              .from("telegram_contacts")
              .update({ last_example_at: new Date().toISOString() })
              .eq("chat_id", chatId)
              .then(() => {}, () => {});
            break;
          }
          // Telegram rechaza el file_id → si es un EJEMPLO, desactívalo (subido con
          // otro bot o borrado) y sigue con el siguiente. El diario/bienvenida solo
          // se loguean (son la pieza única del dueño, no se tocan solas).
          const desc = (rv?.description ?? "").toLowerCase();
          if (dv.src === "example" && dv.id != null && /file|identifier|not found|wrong|invalid/.test(desc)) {
            console.warn(`[sandro] ejemplo ${dv.id} file_id inválido, desactivado: ${rv?.description}`);
            await supabaseAdmin.from("telegram_examples").update({ enabled: false }).eq("id", dv.id).then(() => {}, () => {});
          } else if (!rv?.ok) {
            console.warn(`[sandro] fallo al enviar media (${dv.src}): ${rv?.description ?? "sin respuesta"}`);
          }
        }
      }

      // Texto para la IA: si el jugador manda solo un vídeo/foto, dejamos
      // constancia para que el bot lo tenga en cuenta (no puede verlo, pero sabe
      // que lo ha mandado y no responde como si no hubiera pasado nada).
      const entrada =
        textoJ ||
        (msg.video || msg.animation
          ? "[el jugador te ha enviado un vídeo]"
          : msg.photo
          ? "[el jugador te ha enviado una foto]"
          : msg.voice || msg.audio
          ? "[el jugador te ha enviado una nota de voz]"
          : msg.sticker
          ? "[el jugador te ha enviado un sticker]"
          : msg.document
          ? "[el jugador te ha enviado un archivo]"
          : msg.video_note
          ? "[el jugador te ha enviado una nota de vídeo]"
          : msg.location
          ? "[el jugador te ha enviado una ubicación]"
          : msg.contact
          ? "[el jugador te ha compartido un contacto]"
          : "");

      // Si el jugador manda una foto/vídeo, guardamos su file_id + tipo para
      // MOSTRARLO en el visor de chats del panel Y para que la IA lo VEA. En los
      // vídeos guardamos la MINIATURA (un fotograma): así el panel muestra una
      // imagen y la IA puede "ver" de qué va el vídeo (Claude no procesa vídeo,
      // pero sí su miniatura). El documento se guarda tal cual (sin visión).
      const fotosMsg = msg.photo as Array<{ file_id: string }> | undefined;
      const videoThumb =
        (msg.video?.thumbnail?.file_id ?? msg.video?.thumb?.file_id) ?? null;
      const animThumb =
        (msg.animation?.thumbnail?.file_id ?? msg.animation?.thumb?.file_id) ?? null;
      const mediaFileId =
        fotosMsg && fotosMsg.length
          ? fotosMsg[fotosMsg.length - 1].file_id
          : (videoThumb ?? animThumb ?? msg.document?.file_id ?? null);
      const mediaTipo =
        fotosMsg && fotosMsg.length
          ? "photo"
          : msg.video
          ? "video"
          : msg.animation
          ? "animation"
          : msg.document
          ? "document"
          : null;

      // Guardamos YA el mensaje del jugador (antes de responder) y nos quedamos
      // con su id (para el "piensa antes de responder" de abajo).
      const { data: insertadoUser } = await supabaseAdmin
        .from("telegram_messages")
        .insert({
          chat_id: chatId,
          role: "user",
          content: entrada || "(envió algo)",
          file_id: mediaFileId,
          media_type: mediaTipo,
        })
        .select("id")
        .maybeSingle();
      const miMsgId = (insertadoUser?.id as number | undefined) ?? undefined;

      // Si el mensaje es SOLO cortesía/cierre ("ok", "gracias", "mañana te digo")
      // y NO trae media, no respondemos. Se calcula ANTES del debounce para no
      // gastar 4,5s + "escribiendo…" + query en un mensaje que nunca va a contestar.
      const soloCierre =
        esSoloCierre(entrada) && !msg.photo && !msg.video && !msg.animation && !msg.document;

      // PIENSA ANTES DE RESPONDER (agrupa mensajes seguidos): esperamos unos
      // segundos; si mientras tanto el jugador manda OTRO mensaje (p. ej. primero
      // un vídeo y luego el texto), ESTE no responde y deja que responda el
      // último, que ya tendrá TODO el contexto. Así el bot no "pasa" del vídeo ni
      // contesta a medias. Solo aplica cuando vamos a responder con la IA.
      let debounced = false;
      if (entrada && iaConfigurada() && !limitado && !videoEnviado && !soloCierre) {
        // "Escribiendo…" para que se vea que está pensando durante la espera.
        tgApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(
          () => {}
        );
        await new Promise((r) => setTimeout(r, 4500));
        if (miMsgId) {
          const { data: masNuevos } = await supabaseAdmin
            .from("telegram_messages")
            .select("id, content, media_type")
            .eq("chat_id", chatId)
            .eq("role", "user")
            .gt("id", miMsgId)
            .order("id", { ascending: true })
            .limit(10);
          // Solo nos callamos si hay un mensaje posterior REAL: con MEDIA (foto/
          // vídeo, aunque su pie sea "gracias" — ese sí se responde) o con texto
          // que NO es pura cortesía. Un "gracias" de texto suelto NO cuenta (así
          // no deja sin respuesta la pregunta anterior); una foto SÍ (así no se
          // responde dos veces).
          if (
            masNuevos &&
            masNuevos.some(
              (m) => m.media_type || !esSoloCierre(String(m.content ?? ""))
            )
          ) {
            debounced = true;
          }
        }
      }

      // Contexto REAL de la conversación: se lee AHORA (tras la espera), así
      // incluye los mensajes del grupo (el vídeo que mandó justo antes). Respeta
      // el corte de "Reiniciar memoria" y excluye el mensaje actual (va aparte
      // como `entrada`).
      const desde = contacto?.memory_reset_at ?? "1970-01-01T00:00:00Z";
      const { data: prev } = await supabaseAdmin
        .from("telegram_messages")
        .select("id, role, content, created_at")
        .eq("chat_id", chatId)
        .gt("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(120);
      const prevRows = ((prev ?? []) as { id: number; role: string; content: string; created_at: string }[])
        .filter((m) => m.id !== miMsgId && (m.role === "user" || m.role === "assistant") && !!m.content);
      // Hueco desde el último mensaje hasta AHORA (retoma tras horas/días).
      const ultimoTs = prevRows.length ? new Date(prevRows[0].created_at).getTime() : null;
      const huecoAhora = ultimoTs != null ? marcaHueco(Date.now() - ultimoTs) : "";
      let prevT: number | null = null;
      const historial: Turno[] = [...prevRows].reverse().map((m) => {
        const t = new Date(m.created_at).getTime();
        const marca = prevT != null ? marcaHueco(t - prevT) : "";
        prevT = t;
        return { role: m.role as "user" | "assistant", content: marca + m.content };
      });

      // La IA responde (si no está limitada, no se pasó el tope diario y no ha
      // quedado "debounced" por un mensaje posterior).
      const TOPE_DIA = 5000;
      let respuesta: string | null = null;
      if (entrada && iaConfigurada() && !limitado && !videoEnviado && !debounced && !soloCierre) {
        const hoy = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid",
        }).format(new Date());
        // Reservamos un hueco del tope diario de forma ATÓMICA (INSERT ... ON
        // CONFLICT ... count+1 RETURNING). Así, aunque lleguen muchos mensajes a
        // la vez, el contador no pierde incrementos y el tope SÍ frena el gasto.
        const { data: usoActual } = await supabaseAdmin.rpc(
          "increment_ai_daily",
          { p_day: hoy }
        );
        // Si la función aún no existe (SQL sin aplicar), usoActual = null → no
        // bloqueamos (el bot sigue), pero el tope no protegerá hasta aplicar SQL.
        const dentroTope =
          typeof usoActual !== "number" || usoActual <= TOPE_DIA;
        // Cap DIARIO POR CHAT: un solo jugador no puede acaparar el cupo global de
        // IA (antes uno podía agotar el tope del día y dejar a TODOS con respuesta
        // genérica). 200 respuestas/día por chat es holgadísimo para un usuario
        // real y frena el abuso. Solo cuenta cuando de verdad vamos a llamar a la IA.
        const dentroCapChat = dentroTope
          ? await rateLimitShared(`aichat:${chatId}`, 200, 24 * 60 * 60 * 1000)
          : false;
        if (dentroTope && dentroCapChat) {
          // Imagen para la IA: la del mensaje actual si trae; si no, la del último
          // mensaje reciente del jugador con media (para no perder el vídeo/foto
          // que mandó justo antes del texto). En vídeos, file_id ya es la miniatura.
          let visionFileId: string | null = mediaFileId;
          if (!visionFileId) {
            const { data: ultMedia } = await supabaseAdmin
              .from("telegram_messages")
              .select("file_id")
              .eq("chat_id", chatId)
              .eq("role", "user")
              .not("file_id", "is", null)
              .in("media_type", ["photo", "video", "animation"])
              .gt("created_at", new Date(Date.now() - 3 * 60 * 1000).toISOString())
              .order("created_at", { ascending: false })
              .limit(1);
            visionFileId = (ultMedia?.[0]?.file_id as string | undefined) ?? null;
          }
          const imagen = visionFileId ? await descargarFoto(visionFileId) : null;
          respuesta = await responderIA(
            historial,
            huecoAhora + entrada,
            imagen,
            from.first_name ?? null
          );
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
        },
        { onConflict: "chat_id" }
      );

      // Respuesta al jugador. Texto plano (sin HTML): la IA podría meter un "<".
      // El botón del enlace (= su enlace de afiliado) sale cuando hay intención de
      // jugar/entrar/depositar, mirando TANTO la respuesta del bot COMO lo que
      // escribió el jugador (patrón, vídeo, promo, cuánto…). Así el enlace aparece
      // pronto y no solo cuando ya dicen que depositaron. Solo lo omitimos en
      // mensajitos sin nada de eso (saludos sueltos, quejas puras).
      const intencionJugar =
        /jug|entr|deposit|recarg|vuelve|enlace|link|registr|apuest|patr|v[ií]deo|cuadr|\bmin[ae]s?\b|casino|promo|bono|empez|quiero|gan[ao]|d[oó]nde|m[aá]ndame|p[aá]same|\b20\b|\b30\b|\b100\b|\b150\b/i;
      // Guardamos el mensaje del jugador para la limpieza automática de chats.
      await guardarMsg(chatId, msg.message_id);
      if (respuesta) {
        // ⏳ Retardo "humano" VARIABLE antes de enviar: una persona lee, piensa y
        // escribe; un bot clava siempre el mismo tiempo y eso se nota (a Daniel le
        // chocó "¿por qué respondes tan rápido?"). Metemos una espera aleatoria +
        // algo proporcional a lo que "escribe", con "escribiendo…" visible. La
        // función aguanta 60s, así que hay margen de sobra.
        const escribir =
          2000 + Math.floor(Math.random() * 5000) + Math.min(3500, respuesta.length * 30);
        tgApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
        await new Promise((r) => setTimeout(r, escribir));
        // ⛔ El botón "GANAR AHORA" es un pitch para JUGAR/DEPOSITAR: NO debe salir
        // cuando el jugador está RETIRANDO, tiene un PROBLEMA o pide SOPORTE (ahí molesta
        // y canta a bot). Antes salía casi siempre porque intencionJugar es muy amplio.
        const noPitch =
          /retir|withdraw|sacar|reintegr|rechaz|reject|deneg|no me deja|no puedo|no funciona|\berror\b|soporte|chat en vivo|verific|\bkyc\b|documento/i;
        const invita =
          (intencionJugar.test(respuesta) || intencionJugar.test(textoJ)) &&
          !noPitch.test(respuesta) &&
          !noPitch.test(textoJ);
        const rEnv = await tgEnviar(chatId, respuesta, {
          parse_mode: undefined,
          ...(invita ? { reply_markup: botonSoloJugar() } : {}),
        });
        await guardarMsg(chatId, midDe(rEnv));
      } else if (entrada && !limitado && !videoEnviado && !debounced && !soloCierre) {
        // Si la IA falla (no por spam), no dejamos al jugador sin nada. (Si quedó
        // "debounced", NO mandamos nada: responderá el último mensaje del grupo.)
        // ⛔ !soloCierre: si el jugador solo suelta cortesía ("gracias/ok/vale"),
        // NO respondemos con el pitch comercial (era el caso que soloCierre silencia).
        const rEnv = await tgEnviar(chatId, "¡Dale! 🔥 Recarga y entra a jugar 👇", {
          reply_markup: botonSoloJugar(),
        });
        await guardarMsg(chatId, midDe(rEnv));
      }

      // Guardamos la respuesta del bot en el transcript (el mensaje del jugador
      // ya se guardó antes de responder, arriba).
      if (respuesta || videoEnviado) {
        const { data: insA } = await supabaseAdmin
          .from("telegram_messages")
          .insert({
            chat_id: chatId,
            role: "assistant",
            content: respuesta || "(le envié el vídeo: así juego yo)",
          })
          .select("id")
          .maybeSingle();
        // Si le mandé el vídeo del patrón, guardo su file_id para verlo en el panel.
        // Best-effort: si full_file_id aún no existe como columna, se ignora.
        const insAId = insA?.id as number | undefined;
        if (videoEnviado && videoEnviadoFileId && insAId) {
          await supabaseAdmin
            .from("telegram_messages")
            .update({ full_file_id: videoEnviadoFileId, media_type: videoEnviadoTipo })
            .eq("id", insAId)
            .then(() => {}, () => {});
        }
      }

      // Copia al dueño para que veas la conversación y puedas intervenir.
      // Si el jugador está LIMITADO (spam, >15/min), no te reenviamos cada mensaje
      // a Telegram: así nadie puede inundarte escribiendo muy rápido.
      if (OWNER_CHAT_ID && !limitado) {
        const quien = esc(
          (from.first_name ?? "Jugador") +
            (from.username ? ` (@${from.username})` : "")
        );
        // Usamos textoJ (incluye el PIE de foto/vídeo): así ves lo que escribe
        // el jugador junto a una captura, y lo que respondió la IA.
        const cuerpo = textoJ
          ? ` dice:\n${esc(textoJ)}` +
            (respuesta ? `\n\n🤖 <i>Respondí:</i>\n${esc(respuesta)}` : "")
          : " te ha enviado algo:";
        await tgEnviar(
          OWNER_CHAT_ID,
          `💬 <b>${quien}</b>${cuerpo}\n\n<i>↩️ Responde a este mensaje para escribirle tú</i> [uid:${chatId}]`
        );
        // Si trae foto/vídeo/etc (mensaje sin texto), lo copiamos también, con el
        // marcador [uid] en el pie: así puedes responder DIRECTAMENTE a esa foto
        // y tu respuesta le llega al jugador (antes había que responder al texto).
        if (!text) {
          await tgApi("copyMessage", {
            chat_id: OWNER_CHAT_ID,
            from_chat_id: chatId,
            message_id: msg.message_id,
            caption: `↩️ Responde para escribirle [uid:${chatId}]`,
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
