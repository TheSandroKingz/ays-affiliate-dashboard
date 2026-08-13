// Handler compartido de los BOTS NUEVOS (Jeffer, Mariam, …). Es la versión
// parametrizada por bot del webhook de Sandro: misma lógica (bienvenida, IA,
// ejemplos, reenvío al dueño, comandos), pero sobre las tablas bot_* y con el
// token/enlace/persona de CADA bot. El bot de Sandro NO usa esto (sigue con su
// propio webhook y sus tablas telegram_*). BLINDADO: nunca lanza (Telegram
// reintentaría en bucle).

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  tgEnviar,
  tgApi,
  botonJugar,
  botonSoloJugar,
  descargarFoto,
  ENLACES_PAUSADOS,
} from "@/lib/telegram";
import { responderIABot, iaConfigurada } from "@/lib/telegramAI";
import type { BotDef } from "@/lib/bots";

type Turno = { role: "user" | "assistant"; content: string };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Extrae el archivo (vídeo/foto/gif/documento) de un mensaje de Telegram, si lo trae.
// `miniatura`:
//  - false (por defecto): file_id del ARCHIVO real. Para cuando el bot va a
//    REENVIAR ese vídeo/foto luego (/bienvenida, /ejemplo, /diario). Un vídeo
//    guardado por su miniatura NO se puede reenviar como vídeo.
//  - true: para la media que manda un JUGADOR (guardar para el panel/visión):
//    de un vídeo cogemos la MINIATURA (fotograma) → jpeg válido que la IA "ve".
export function extraerMedia(
  msg: Record<string, unknown>,
  miniatura = false
): { media_type: string; file_id: string } | null {
  type Med = { file_id: string; thumbnail?: { file_id: string }; thumb?: { file_id: string } };
  const photos = msg.photo as Array<{ file_id: string }> | undefined;
  const video = msg.video as Med | undefined;
  const animation = msg.animation as Med | undefined;
  const document = msg.document as { file_id: string } | undefined;
  const miniOrReal = (m: Med) =>
    miniatura ? m.thumbnail?.file_id ?? m.thumb?.file_id ?? m.file_id : m.file_id;
  if (video) return { media_type: "video", file_id: miniOrReal(video) };
  if (animation) return { media_type: "animation", file_id: miniOrReal(animation) };
  if (photos?.length)
    return { media_type: "photo", file_id: photos[photos.length - 1].file_id };
  if (document) return { media_type: "document", file_id: document.file_id };
  return null;
}

// Método de envío de Telegram según el tipo de media (y clave del parámetro).
function metodoMedia(t: string): { metodo: string; campo: string } {
  if (t === "video") return { metodo: "sendVideo", campo: "video" };
  if (t === "animation") return { metodo: "sendAnimation", campo: "animation" };
  if (t === "photo") return { metodo: "sendPhoto", campo: "photo" };
  if (t === "document") return { metodo: "sendDocument", campo: "document" };
  return { metodo: "sendMessage", campo: "text" };
}

// Procesa un update de Telegram para un bot concreto.
export async function procesarUpdate(
  bot: BotDef,
  update: Record<string, unknown>
): Promise<void> {
  const tok = bot.token;
  const owner = bot.owner;
  try {
    // ── Anti-duplicados por bot (el update_id no es único entre bots) ──
    const updateId = update?.update_id as number | undefined;
    if (typeof updateId === "number") {
      const { data: ins, error } = await supabaseAdmin
        .from("bot_updates")
        .upsert(
          { bot: bot.key, update_id: updateId },
          { onConflict: "bot,update_id", ignoreDuplicates: true }
        )
        .select("update_id");
      if (!error && ins && ins.length === 0) return; // ya procesado
    }

    // ── Botón inline (❓ AYUDA) ──
    const cb = update?.callback_query as Record<string, unknown> | undefined;
    if (cb) {
      await tgApi("answerCallbackQuery", { callback_query_id: cb.id }, tok);
      const cid = (cb.message as { chat?: { id?: number } } | undefined)?.chat?.id;
      if (cid && cb.data === "ayuda") {
        await tgEnviar(
          cid,
          `${bot.saludo} Escríbeme aquí mismo tu duda y te ayudo al momento.`,
          {},
          tok
        );
      }
      return;
    }

    const msg = update?.message as Record<string, unknown> | undefined;
    if (!msg || !msg.chat) return;

    const chatId: number = (msg.chat as { id: number }).id;
    const text: string = ((msg.text as string) ?? "").trim();
    const caption: string = ((msg.caption as string) ?? "").trim();
    const from = (msg.from as Record<string, string> | undefined) ?? {};
    const esDueno = !!owner && String(chatId) === String(owner);

    // ── /start : alta + bienvenida ──
    if (text === "/start" || text.startsWith("/start ")) {
      if (!esDueno) {
        await supabaseAdmin.from("bot_contacts").upsert(
          {
            bot: bot.key,
            chat_id: chatId,
            first_name: from.first_name ?? null,
            username: from.username ?? null,
            opted_out: false,
          },
          { onConflict: "bot,chat_id" }
        );
      }
      const { data: cfg } = await supabaseAdmin
        .from("bot_config")
        .select("welcome_text, welcome_media_type, welcome_file_id, welcome_enabled")
        .eq("bot", bot.key)
        .maybeSingle();
      const textoBienv = (cfg?.welcome_text || bot.bienvenida) as string;
      const boton = botonJugar(bot.enlace);
      let bienvOk = false;
      if (cfg?.welcome_enabled !== false && cfg?.welcome_file_id) {
        const { metodo, campo } = metodoMedia(cfg.welcome_media_type as string);
        const params: Record<string, unknown> = {
          chat_id: chatId,
          caption: textoBienv,
          parse_mode: "HTML",
          reply_markup: boton,
        };
        params[campo] = cfg.welcome_file_id;
        const rb = await tgApi(metodo, params, tok);
        bienvOk = !!rb?.ok;
      }
      // Si no había vídeo, o el vídeo FALLÓ (p. ej. file_id de otro bot que no
      // vale), mandamos el TEXTO igualmente: el /start SIEMPRE responde.
      if (!bienvOk) {
        await tgEnviar(chatId, textoBienv, { reply_markup: boton }, tok);
      }
      return;
    }

    // ── /stop : baja ──
    if (text === "/stop" || text === "/baja") {
      await supabaseAdmin
        .from("bot_contacts")
        .update({ opted_out: true })
        .eq("bot", bot.key)
        .eq("chat_id", chatId);
      await tgEnviar(
        chatId,
        "Hecho, no recibirás más mensajes. Escribe /start para volver.",
        {},
        tok
      );
      return;
    }

    const cmd = (text || caption).trim();
    const cmdLower = cmd.toLowerCase();

    // ── DUEÑO: /promo <texto> (promo activa que el bot menciona; "off" la quita) ──
    if (esDueno && cmdLower.startsWith("/promo")) {
      const resto = cmd.replace(/^\/promo\s*/i, "").trim();
      const promo = /^off$/i.test(resto) ? null : resto || null;
      await supabaseAdmin
        .from("bot_config")
        .upsert(
          { bot: bot.key, promo, updated_at: new Date().toISOString() },
          { onConflict: "bot" }
        );
      await tgEnviar(
        chatId,
        promo ? `✅ Promo activa guardada:\n${promo}` : "✅ Promo quitada.",
        {},
        tok
      );
      return;
    }

    // ── DUEÑO: /diario (mensaje diario automático) ──
    if (esDueno && cmdLower.startsWith("/diario")) {
      const resto = cmd.replace(/^\/diario\s*/i, "").trim();
      if (/^off$/i.test(resto)) {
        await supabaseAdmin
          .from("bot_config")
          .upsert(
            { bot: bot.key, daily_enabled: false, updated_at: new Date().toISOString() },
            { onConflict: "bot" }
          );
        await tgEnviar(chatId, "⏸️ Mensaje diario pausado. /diario on para reactivarlo.", {}, tok);
        return;
      }
      if (/^on$/i.test(resto)) {
        await supabaseAdmin
          .from("bot_config")
          .upsert(
            { bot: bot.key, daily_enabled: true, updated_at: new Date().toISOString() },
            { onConflict: "bot" }
          );
        await tgEnviar(chatId, "▶️ Mensaje diario reactivado.", {}, tok);
        return;
      }
      const media = extraerMedia(msg);
      if (media) {
        await supabaseAdmin.from("bot_config").upsert(
          {
            bot: bot.key,
            daily_media_type: media.media_type,
            daily_file_id: media.file_id,
            daily_caption: resto || null,
            daily_enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bot" }
        );
        await tgEnviar(chatId, "✅ Guardado como mensaje diario. Se enviará cada mañana a todos.", {}, tok);
      } else if (resto) {
        await supabaseAdmin.from("bot_config").upsert(
          {
            bot: bot.key,
            daily_media_type: "text",
            daily_file_id: null,
            daily_caption: resto,
            daily_enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bot" }
        );
        await tgEnviar(chatId, "✅ Guardado (texto) como mensaje diario.", {}, tok);
      } else {
        await tgEnviar(chatId, "Mándame /diario junto con el vídeo o foto (escribe /diario en el pie), o /diario seguido de un texto.", {}, tok);
      }
      return;
    }

    // ── DUEÑO: /bienvenida (vídeo/foto que se envía con cada /start) ──
    if (esDueno && cmdLower.startsWith("/bienvenida")) {
      const resto = cmd.replace(/^\/bienvenida\s*/i, "").trim();
      if (/^off$/i.test(resto)) {
        await supabaseAdmin
          .from("bot_config")
          .upsert(
            { bot: bot.key, welcome_enabled: false, updated_at: new Date().toISOString() },
            { onConflict: "bot" }
          );
        await tgEnviar(chatId, "⏸️ Vídeo de bienvenida quitado (la bienvenida irá en solo texto).", {}, tok);
        return;
      }
      const media = extraerMedia(msg);
      if (media) {
        await supabaseAdmin.from("bot_config").upsert(
          {
            bot: bot.key,
            welcome_media_type: media.media_type,
            welcome_file_id: media.file_id,
            welcome_enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bot" }
        );
        await tgEnviar(chatId, "✅ Guardado como vídeo de bienvenida. Para quitarlo: /bienvenida off.", {}, tok);
      } else {
        await tgEnviar(chatId, "Mándame /bienvenida junto con el vídeo o foto (escribe /bienvenida en el pie).", {}, tok);
      }
      return;
    }

    // ── DUEÑO: /ejemplo(s) (biblioteca de "así juego yo") ──
    if (esDueno && /^\/ejemplos?\b/i.test(cmd)) {
      const resto = cmd.replace(/^\/ejemplos?\s*/i, "").trim();
      if (/^(borrar|vaciar|reset)/i.test(resto)) {
        await supabaseAdmin.from("bot_examples").delete().eq("bot", bot.key);
        await tgEnviar(chatId, "🗑️ Biblioteca de ejemplos vaciada.", {}, tok);
        return;
      }
      const media = extraerMedia(msg);
      const contar = async () => {
        const { count } = await supabaseAdmin
          .from("bot_examples")
          .select("id", { count: "exact", head: true })
          .eq("bot", bot.key)
          .eq("enabled", true);
        return count ?? 0;
      };
      if (media) {
        await supabaseAdmin
          .from("bot_examples")
          .insert({ bot: bot.key, media_type: media.media_type, file_id: media.file_id });
        await tgEnviar(
          chatId,
          `✅ Ejemplo añadido. Ya tienes ${await contar()} guardados. Manda más con /ejemplo. Para vaciar: /ejemplos borrar.`,
          {},
          tok
        );
      } else {
        await tgEnviar(
          chatId,
          `Tienes ${await contar()} ejemplos guardados. Para añadir: mándame /ejemplo junto con el vídeo o foto (escribe /ejemplo en el pie).`,
          {},
          tok
        );
      }
      return;
    }

    // ── DUEÑO: /todos (envío en masa) ──
    if (esDueno && cmdLower.startsWith("/todos")) {
      const resto = cmd.replace(/^\/todos\s*/i, "").trim();
      const media = extraerMedia(msg);
      if (!media && !resto) {
        await tgEnviar(chatId, "Mándame /todos con un vídeo o foto en el pie, o /todos seguido de un texto.", {}, tok);
        return;
      }
      const { data: cs } = await supabaseAdmin
        .from("bot_contacts")
        .select("chat_id")
        .eq("bot", bot.key)
        .eq("opted_out", false)
        .eq("silenced", false);
      const ids = (cs ?? []).map((c) => c.chat_id as number);
      const boton = botonJugar(bot.enlace);
      let env = 0;
      const bloq: number[] = [];
      for (let i = 0; i < ids.length; i += 25) {
        const tanda = ids.slice(i, i + 25);
        await Promise.all(
          tanda.map(async (cid) => {
            const p: Record<string, unknown> = media
              ? { chat_id: cid, caption: resto || undefined, reply_markup: boton }
              : { chat_id: cid, text: resto, reply_markup: boton, disable_web_page_preview: true };
            const { metodo, campo } = metodoMedia(media?.media_type ?? "text");
            if (media) p[campo] = media.file_id;
            const r = await tgApi(metodo, p, tok);
            if (r?.ok) {
              env++;
            } else if (r && /blocked|deactivated|kicked/i.test(r.description ?? "")) {
              bloq.push(cid);
            }
          })
        );
        if (i + 25 < ids.length) await new Promise((r) => setTimeout(r, 1000));
      }
      if (bloq.length) {
        await supabaseAdmin
          .from("bot_contacts")
          .update({ opted_out: true })
          .eq("bot", bot.key)
          .in("chat_id", bloq);
      }
      await tgEnviar(chatId, `✅ Enviado a ${env} de ${ids.length}.`, {}, tok);
      return;
    }

    // ── DUEÑO responde a una duda reenviada → mandarla al jugador ──
    const refDueno =
      (msg.reply_to_message as { text?: string; caption?: string } | undefined)?.text ||
      (msg.reply_to_message as { text?: string; caption?: string } | undefined)?.caption;
    if (esDueno && refDueno) {
      const marcadores = [...refDueno.matchAll(/\[uid:(\d+)\]/g)];
      const m = marcadores[marcadores.length - 1];
      if (m) {
        const destino = Number(m[1]);
        const r = await tgApi(
          "copyMessage",
          { chat_id: destino, from_chat_id: chatId, message_id: msg.message_id },
          tok
        );
        if (r?.ok) {
          const contenidoDueno = text || caption || "(te envió una imagen/vídeo)";
          await supabaseAdmin
            .from("bot_messages")
            .insert({ bot: bot.key, chat_id: destino, role: "assistant", content: contenidoDueno })
            .then(() => {}, () => {});
        }
        await tgEnviar(
          chatId,
          r?.ok ? "✅ Enviado." : "⚠️ No se pudo enviar (puede que bloqueara el bot).",
          {},
          tok
        );
      } else {
        await tgEnviar(chatId, "No pude identificar a quién responder.", {}, tok);
      }
      return;
    }

    // ── Un JUGADOR escribe → la IA responde + copia al dueño ──
    if (esDueno) return; // el dueño sin comando ni reply: no hacemos nada

    const { data: contacto } = await supabaseAdmin
      .from("bot_contacts")
      .select("silenced, memory_reset_at, last_example_at")
      .eq("bot", bot.key)
      .eq("chat_id", chatId)
      .maybeSingle();
    if (contacto?.silenced) return;

    const LIMITE_IA = 8;
    const { data: nUsuario } = await supabaseAdmin.rpc("bump_bot_ai_user", {
      p_bot: bot.key,
      p_chat_id: chatId,
      p_ventana_ms: 60_000,
    });
    const limitado = typeof nUsuario === "number" && nUsuario > LIMITE_IA;

    const textoJ = text || caption;

    // ¿Piden el patrón/vídeo, dicen que una forma les falló, o mandan un vídeo?
    const pidePatron =
      /patr[oó]n|estrateg|cuadrad|cuadro|\btruco|\btip|\bejemplo|c[oó]mo (se |lo |le |te )?(juega|juego|jueg[oa]|da\b|das|doy|hac|hago)|(ens[eé][ñn]a|mu[eé]stra|m[aá]nd|env[ií]|p[aá]s|dame|tienes|hay|quiero ver|quiero un|ver el|ver un|en cu[aá]l|d[oó]nde|esperando)\w*[^.\n]{0,15}v[ií]deos?/i.test(
        textoJ
      );
    // Reenvío EXPLÍCITO: piden claramente que les mandes el vídeo/patrón otra vez
    // (no una duda). Esto SÍ salta el candado de "no dos seguidos".
    const reenvioExplicito =
      /(m[aá]nd|env[ií]|p[aá]s|reenv[ií]|repit)\w*[^.\n]{0,18}(v[ií]deo|patr[oó]n|clip|ejemplo)|(v[ií]deo|patr[oó]n|clip|ejemplo)[^.\n]{0,18}(otra vez|de nuevo|de vuelta|reenv|repit)/i.test(
        textoJ
      );
    const mandoVideo = !!(msg.video || msg.animation);
    const falloForma =
      /no me (va|funciona|sal|tir|acier|sirv)|no funciona|no va|me falla|fall[oó]|pet[oó]|\bpeta\b|no acierto|salen? bomba|me sale bomba|explot|no gano|otra forma|otro ejemplo/i.test(
        textoJ
      );
    // Pide OTRO/MÁS ejemplo explícitamente → se lo mandamos aunque haya cooldown.
    const pideOtro =
      /(otro|otra|m[aá]s|siguiente)\s*(ejemplo|forma|v[ií]deo|truco|patr[oó]n)|otro ejemplo|otra forma/i.test(
        textoJ
      );
    const problemaReal =
      /retir|cobr|\bpag|dep[oó]sito|cuenta|verific|bloque|correo|email|bono|bonus|can ?not|make a bet|saldo|reclamaci|estafa/i.test(
        textoJ
      );
    // Cooldown corto (20 min): no repetir el ejemplo a cada mensaje, pero sí
    // mandar varios en una charla (antes eran 6h y "no mandaba" cuando pedían).
    const COOLDOWN_EJEMPLO_MS = 20 * 60 * 1000;
    const msDesdeEjemplo = contacto?.last_example_at
      ? Date.now() - new Date(contacto.last_example_at as string).getTime()
      : Infinity;
    const ejemploReciente = msDesdeEjemplo < COOLDOWN_EJEMPLO_MS;
    // "Justo antes": el vídeo anterior fue hace <3 min → NUNCA mandar otro seguido
    // (ni aunque pidan "otro"), para no soltar el vídeo dos veces consecutivas.
    const ejemploJustoAntes = msDesdeEjemplo < 3 * 60 * 1000;

    let videoEnviado = false;
    if (
      !ENLACES_PAUSADOS &&
      // SOLO cuando lo PIDEN de verdad (patrón/vídeo/otro ejemplo). NO en automático
      // ante una duda cualquiera, ni cuando dicen que PIERDEN/no les va (falloForma):
      // ahí toca una respuesta personalizada con empatía, no soltar el mismo vídeo.
      (pidePatron || pideOtro) &&
      !problemaReal &&
      !limitado &&
      // No dos vídeos seguidos ante una DUDA; PERO si lo piden EXPLÍCITAMENTE
      // ("mándame el vídeo otra vez"), se lo mandamos igual.
      (!ejemploJustoAntes || reenvioExplicito) &&
      (!ejemploReciente || pideOtro || reenvioExplicito)
    ) {
      // Un ejemplo al azar de la biblioteca del bot; si no hay, el /diario del bot.
      let dv: { media_type: string | null; file_id: string | null } | null = null;
      const { data: ejs } = await supabaseAdmin
        .from("bot_examples")
        .select("media_type, file_id")
        .eq("bot", bot.key)
        .eq("enabled", true)
        .limit(100000);
      if (ejs && ejs.length) {
        const pick = ejs[Math.floor(Math.random() * ejs.length)];
        dv = { media_type: pick.media_type, file_id: pick.file_id };
      }
      if (!dv) {
        const { data: cfg } = await supabaseAdmin
          .from("bot_config")
          .select("daily_media_type, daily_file_id, daily_enabled")
          .eq("bot", bot.key)
          .maybeSingle();
        if (cfg?.daily_enabled !== false && cfg?.daily_file_id)
          dv = { media_type: cfg.daily_media_type, file_id: cfg.daily_file_id };
      }
      if (dv && dv.file_id) {
        const { metodo, campo } = metodoMedia(dv.media_type ?? "");
        const p: Record<string, unknown> = {
          chat_id: chatId,
          caption: (mandoVideo || falloForma)
            ? "Toma, prueba así también 🔥 es OTRA de mis formas. Míralo y hazlo igual."
            : "Aquí tienes 🔥 así le doy yo. Hazlo igual que en esta y dale.",
          reply_markup: botonSoloJugar(bot.enlace),
        };
        p[campo] = dv.file_id;
        const rv = await tgApi(metodo, p, tok);
        if (rv?.ok) {
          videoEnviado = true;
          await supabaseAdmin
            .from("bot_contacts")
            .update({ last_example_at: new Date().toISOString() })
            .eq("bot", bot.key)
            .eq("chat_id", chatId)
            .then(() => {}, () => {});
        }
      }
    }

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
        : "");

    // Memoria de la charla desde el transcript (respetando el corte de memoria).
    const desde = contacto?.memory_reset_at ?? "1970-01-01T00:00:00Z";
    const { data: prev } = await supabaseAdmin
      .from("bot_messages")
      .select("role, content")
      .eq("bot", bot.key)
      .eq("chat_id", chatId)
      .gt("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(60);
    const historial: Turno[] = ((prev ?? []) as { role: string; content: string }[])
      .reverse()
      .filter((m) => (m.role === "user" || m.role === "assistant") && !!m.content)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // file_id de la media del jugador (para verla en el panel).
    const mediaJ = extraerMedia(msg, true); // media del jugador: miniatura (panel/visión)

    const { data: insUser } = await supabaseAdmin
      .from("bot_messages")
      .insert({
        bot: bot.key,
        chat_id: chatId,
        role: "user",
        content: entrada || "(envió algo)",
        file_id: mediaJ?.file_id ?? null,
        media_type: mediaJ?.media_type ?? null,
      })
      .select("id")
      .maybeSingle();
    const miMsgId = (insUser?.id as number | undefined) ?? null;

    // PIENSA ANTES DE RESPONDER (agrupa mensajes seguidos): esperamos unos segundos;
    // si mientras tanto el jugador manda OTRO mensaje (p. ej. foto y luego texto),
    // ESTE no responde y deja que responda el último, que ya tendrá TODO el contexto.
    // Evita la doble respuesta. Solo cuando vamos a responder con la IA.
    let debounced = false;
    if (entrada && iaConfigurada() && !limitado && !videoEnviado && miMsgId) {
      tgApi("sendChatAction", { chat_id: chatId, action: "typing" }, tok).catch(() => {});
      await new Promise((r) => setTimeout(r, 4500));
      const { data: masNuevos } = await supabaseAdmin
        .from("bot_messages")
        .select("id")
        .eq("bot", bot.key)
        .eq("chat_id", chatId)
        .eq("role", "user")
        .gt("id", miMsgId)
        .limit(1);
      if (masNuevos && masNuevos.length) debounced = true;
    }

    // La IA responde (si no está limitada, dentro del tope y no ha quedado debounced).
    const TOPE_DIA = 5000;
    let respuesta: string | null = null;
    let promo = "";
    if (entrada && iaConfigurada() && !limitado && !videoEnviado && !debounced) {
      tgApi("sendChatAction", { chat_id: chatId, action: "typing" }, tok).catch(() => {});
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(
        new Date()
      );
      const { data: usoActual } = await supabaseAdmin.rpc("increment_bot_ai_daily", {
        p_bot: bot.key,
        p_day: hoy,
      });
      const dentroTope = typeof usoActual !== "number" || usoActual <= TOPE_DIA;
      if (dentroTope) {
        const { data: cfg } = await supabaseAdmin
          .from("bot_config")
          .select("promo")
          .eq("bot", bot.key)
          .maybeSingle();
        promo = (cfg?.promo ?? "").trim();
        // Imagen para la IA: la foto/fotograma del mensaje actual (mediaJ ya trae
        // la miniatura de vídeos/gifs); si no trae, la última imagen reciente del
        // jugador (mandó la captura en un mensaje y el texto en otro → así el bot
        // no responde a ciegas a "¿qué ves aquí?").
        let visionFileId: string | null =
          mediaJ &&
          (mediaJ.media_type === "photo" ||
            mediaJ.media_type === "video" ||
            mediaJ.media_type === "animation")
            ? mediaJ.file_id
            : null;
        if (!visionFileId) {
          const { data: ultFoto } = await supabaseAdmin
            .from("bot_messages")
            .select("file_id")
            .eq("bot", bot.key)
            .eq("chat_id", chatId)
            .eq("role", "user")
            .in("media_type", ["photo", "video", "animation"])
            .not("file_id", "is", null)
            .gt("created_at", new Date(Date.now() - 3 * 60 * 1000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1);
          visionFileId = (ultFoto?.[0]?.file_id as string | undefined) ?? null;
        }
        const imagen = visionFileId ? await descargarFoto(visionFileId, tok) : null;
        respuesta = await responderIABot(
          bot.persona,
          promo,
          historial,
          entrada,
          imagen,
          from.first_name ?? null
        );
      }
    }

    await supabaseAdmin.from("bot_contacts").upsert(
      {
        bot: bot.key,
        chat_id: chatId,
        first_name: from.first_name ?? null,
        username: from.username ?? null,
        last_msg_at: new Date().toISOString(),
      },
      { onConflict: "bot,chat_id" }
    );

    const intencionJugar =
      /jug|entr|deposit|recarg|vuelve|enlace|link|registr|apuest|patr|v[ií]deo|cuadr|min[ae]s?|casino|promo|bono|empez|quiero|gan[ao]|d[oó]nde|m[aá]ndame|p[aá]same|\b20\b|\b30\b|\b100\b|\b150\b/i;
    if (respuesta) {
      const invita = intencionJugar.test(respuesta) || intencionJugar.test(textoJ);
      await tgEnviar(
        chatId,
        respuesta,
        { parse_mode: undefined, ...(invita ? { reply_markup: botonSoloJugar(bot.enlace) } : {}) },
        tok
      );
    } else if (entrada && !limitado && !videoEnviado && !debounced) {
      await tgEnviar(
        chatId,
        "¡Dale! 🔥 Recarga y entra a jugar 👇",
        { reply_markup: botonSoloJugar(bot.enlace) },
        tok
      );
    }

    if (respuesta || videoEnviado) {
      await supabaseAdmin
        .from("bot_messages")
        .insert({
          bot: bot.key,
          chat_id: chatId,
          role: "assistant",
          content: respuesta || "(le envié el vídeo: así juego yo)",
        })
        .then(() => {}, () => {});
    }

    // Copia al dueño del bot para que vea la conversación y pueda intervenir.
    if (owner && !limitado) {
      const quien = esc(
        (from.first_name ?? "Jugador") + (from.username ? ` (@${from.username})` : "")
      );
      const cuerpo = textoJ
        ? ` dice:\n${esc(textoJ)}` + (respuesta ? `\n\n🤖 <i>Respondí:</i>\n${esc(respuesta)}` : "")
        : " te ha enviado algo:";
      await tgEnviar(
        owner,
        `💬 <b>${quien}</b>${cuerpo}\n\n<i>↩️ Responde a este mensaje para escribirle tú</i> [uid:${chatId}]`,
        {},
        tok
      );
      if (!text) {
        await tgApi(
          "copyMessage",
          {
            chat_id: owner,
            from_chat_id: chatId,
            message_id: msg.message_id,
            caption: `↩️ Responde para escribirle [uid:${chatId}]`,
          },
          tok
        );
      }
    }
  } catch {
    /* nunca lanzamos: Telegram reintentaría en bucle */
  }
}
