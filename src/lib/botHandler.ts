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
import { responderIABot, iaConfigurada, marcaHueco, esSoloCierre, ABUSO_RE } from "@/lib/telegramAI";
import { rateLimitShared } from "@/lib/rateLimit";
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
      // Paginado: PostgREST corta a 1000 filas → sin esto, a partir del contacto
      // 1000 nadie recibe el envío masivo. Traemos TODOS en páginas de 1000.
      const ids: number[] = [];
      for (let off = 0; ; off += 1000) {
        const { data: cs } = await supabaseAdmin
          .from("bot_contacts")
          .select("chat_id")
          .eq("bot", bot.key)
          .eq("opted_out", false)
          .eq("silenced", false)
          .range(off, off + 999);
        const tanda = (cs ?? []).map((c) => c.chat_id as number);
        ids.push(...tanda);
        if (tanda.length < 1000) break;
      }
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

    // ── ANTI-TROLL: si insulta o acusa de estafa ("estafador", "scammer"…) de
    // forma PERSISTENTE, dejamos de contestarle para no gastar IA. A los 3 se
    // auto-silencia; un uso suelto NO silencia. El dueño lo reactiva en el panel.
    if (textoJ && ABUSO_RE.test(textoJ)) {
      const { data: prevAbuso } = await supabaseAdmin
        .from("bot_messages")
        .select("content")
        .eq("bot", bot.key)
        .eq("chat_id", chatId)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(12);
      const nAbuso =
        1 +
        (prevAbuso ?? []).filter((m) => ABUSO_RE.test(String(m.content ?? ""))).length;
      if (nAbuso >= 2) {
        await supabaseAdmin
          .from("bot_contacts")
          .update({ silenced: true })
          .eq("bot", bot.key)
          .eq("chat_id", chatId);
        if (owner) {
          await tgEnviar(
            String(owner),
            `🔇 Silenciado ${esc(from.first_name ?? "un usuario")} (chat ${chatId}) en ${bot.label}: varios insultos/acusaciones, dejé de contestarle. Reactívalo quitándole el silencio en el panel.`,
            {},
            tok
          ).catch(() => {});
        }
        return;
      }
    }

    // ¿Piden el patrón/vídeo, dicen que una forma les falló, o mandan un vídeo?
    const pidePatron =
      /patr[oó]n|estrateg|cuadrad|cuadro|\btruco|\btips?\b|(?<!por )ejemplo|c[oó]mo (se |lo |le |te )?(juega|juego|jueg[oa]|da\b|das|doy|hac|hago)|(ens[eé][ñn]a|mu[eé]stra|m[aá]nd|env[ií]|p[aá]s|dame|tienes|hay|quiero ver|quiero un|ver el|ver un|en cu[aá]l|d[oó]nde|esperando)\w*[^.\n]{0,15}v[ií]deos?/i.test(
        textoJ
      );
    // Reenvío EXPLÍCITO: piden claramente que les mandes el vídeo/patrón otra vez
    // (no una duda). Esto SÍ salta el candado de "no dos seguidos".
    // Negación: si DICE que NO quiere el vídeo/ejemplo, NO cuenta como petición.
    const negPide =
      /\b(no|nunca|ya no|deja de|para de|dejad? de|dej[eé]is de|dejes de)\b\s*(?:(?:me|te|lo|la|los|las|melo|mela)\s*){0,2}(m[aá]nd|env[ií]|p[aá]s|reenv|repit|manda|quiero (?:el|un|ver))\w*/i.test(textoJ);
    // Reenvío EXPLÍCITO = pide el vídeo/patrón OTRA VEZ (con señal clara de "de
    // nuevo": otra vez, reenvía, repite, vuelve a mandar). "pásame un patrón" a
    // secas NO es reenvío (es una 1ª petición normal) y NO debe saltar el candado
    // anti-doble; si no, mandaba el vídeo dos veces al pedirlo dos veces seguidas.
    const reenvioExplicito =
      /(otra vez|de nuevo|de vuelta|nuevamente|reenv[ií]|rep[ií]t|vu[eé]lve a|m[aá]ndamelo otra)/i.test(textoJ) &&
      /(v[ií]deo|patr[oó]n|clip|ejemplo|m[aá]ndamelo|p[aá]samelo|reenv[ií]amelo|env[ií]amelo|m[aá]ndamela|p[aá]samela)/i.test(textoJ) &&
      !negPide;
    const mandoVideo = !!(msg.video || msg.animation);
    const falloForma =
      /no me (va|funciona|sal|tir|acier|sirv)|no funciona|no va|me falla|fall[oó]|pet[oó]|\bpeta\b|no acierto|salen? bomba|me sale bomba|explot|no gano|otra forma|otro ejemplo/i.test(
        textoJ
      );
    // Pide OTRO/MÁS ejemplo explícitamente → se lo mandamos aunque haya cooldown.
    const pideOtro =
      /(otro|otra|m[aá]s|siguiente)\s*(ejemplo|forma|v[ií]deo|truco|patr[oó]n)|otro ejemplo|otra forma/i.test(
        textoJ
      ) && !negPide;
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
    const problemaReal =
      /retir|cobr|\bpag(?:o|u|ar|a\b|as\b|and|ad)|dep[oó]sito|\bcuentas?\b|verific|bloque|correo|email|bono|bonus|can ?not|make a bet|saldo|reclamaci|estafa/i.test(
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
    let videoEnviadoFileId: string | null = null; // para reproducirlo en el panel
    let videoEnviadoTipo: string | null = null;
    if (
      !ENLACES_PAUSADOS &&
      // SOLO cuando lo PIDEN de verdad (patrón/vídeo/otro ejemplo). NO en automático
      // ante una duda cualquiera, ni cuando dicen que PIERDEN/no les va (falloForma):
      // ahí toca una respuesta personalizada con empatía, no soltar el mismo vídeo.
      // Si nombran el patrón DENTRO de una queja (falloForma), NO cuenta como petición;
      // pero un reenvío EXPLÍCITO ("mándamelo otra vez") sí abre el envío.
      ((((pidePatron || pideEnvioExplicito) && !falloForma && !dudaConceptoPatron) || pideOtro || reenvioExplicito) && !patronFuturoOCambio) &&
      !problemaReal &&
      !limitado &&
      // No dos vídeos seguidos ante una DUDA; PERO si lo piden EXPLÍCITAMENTE
      // ("mándame el vídeo otra vez"), se lo mandamos igual.
      (!ejemploJustoAntes || reenvioExplicito) &&
      (!ejemploReciente || pideOtro || reenvioExplicito)
    ) {
      // Candidatos a enviar: los ejemplos de la biblioteca del bot (barajados) y,
      // como último recurso, el /diario. Probamos EN ORDEN hasta que UNO se envíe.
      // Si Telegram rechaza un file_id (típico cuando el vídeo se subió con OTRO
      // bot: los file_id son intransferibles entre bots), ese ejemplo se AUTO-
      // DESACTIVA para no volver a intentarlo y seguimos con el siguiente. Así el
      // bot no se queda pillado eligiendo al azar un vídeo muerto (que dejaba al
      // jugador solo con el enlace, sin el vídeo que pidió).
      type Cand = { id: number | null; media_type: string | null; file_id: string | null };
      const cands: Cand[] = [];
      const { data: ejs } = await supabaseAdmin
        .from("bot_examples")
        .select("id, media_type, file_id")
        .eq("bot", bot.key)
        .eq("enabled", true)
        .limit(200); // biblioteca curada por el dueño (decenas); tope holgado
      for (const e of (ejs ?? []) as Cand[]) cands.push({ id: e.id, media_type: e.media_type, file_id: e.file_id });
      // Barajado (Fisher-Yates) para no mandar siempre el mismo primero.
      for (let i = cands.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cands[i], cands[j]] = [cands[j], cands[i]];
      }
      const { data: cfg } = await supabaseAdmin
        .from("bot_config")
        .select("daily_media_type, daily_file_id, daily_enabled")
        .eq("bot", bot.key)
        .maybeSingle();
      if (cfg?.daily_enabled !== false && cfg?.daily_file_id)
        cands.push({ id: null, media_type: cfg.daily_media_type, file_id: cfg.daily_file_id });

      const caption = (mandoVideo || falloForma)
        ? "Toma, prueba así también 🔥 es OTRA de mis formas. Míralo y hazlo igual."
        : "Aquí tienes 🔥 así le doy yo. Hazlo igual que en esta y dale.";
      for (const dv of cands) {
        if (!dv.file_id) continue;
        const { metodo, campo } = metodoMedia(dv.media_type ?? "");
        const p: Record<string, unknown> = { chat_id: chatId, caption, reply_markup: botonSoloJugar(bot.enlace) };
        p[campo] = dv.file_id;
        const rv = await tgApi(metodo, p, tok);
        if (rv?.ok) {
          videoEnviado = true;
          videoEnviadoFileId = dv.file_id;
          videoEnviadoTipo = dv.media_type ?? "video";
          await supabaseAdmin
            .from("bot_contacts")
            .update({ last_example_at: new Date().toISOString() })
            .eq("bot", bot.key)
            .eq("chat_id", chatId)
            .then(() => {}, () => {});
          break;
        }
        // Telegram rechaza el file_id (subido con otro bot, o borrado): desactiva
        // ese ejemplo para que no vuelva a elegirse, y prueba con el siguiente.
        const desc = (rv?.description ?? "").toLowerCase();
        if (dv.id != null && /file|identifier|not found|wrong|invalid/.test(desc)) {
          console.warn(`[bot ${bot.key}] ejemplo ${dv.id} file_id inválido, desactivado: ${rv?.description}`);
          await supabaseAdmin
            .from("bot_examples")
            .update({ enabled: false })
            .eq("id", dv.id)
            .then(() => {}, () => {});
        } else if (!rv?.ok) {
          console.warn(`[bot ${bot.key}] fallo al enviar media: ${rv?.description ?? "sin respuesta"}`);
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

    // La memoria de la charla se lee MÁS ABAJO, DESPUÉS del debounce, para que
    // incluya los mensajes que el jugador manda AGRUPADOS (foto + texto seguidos):
    // si se leyera aquí, el que responde no vería el mensaje/captura hermano. Y así
    // tampoco se carga cuando el chat está limitado o queda debounced (no responde).
    let historial: Turno[] = [];
    let huecoAhora = "";

    // file_id de la media del jugador = miniatura (la usa la visión de la IA y como
    // fotograma). Para vídeos guardamos aparte el archivo REAL en `full_file_id`
    // (best-effort más abajo) para poder REPRODUCIRLO en el panel.
    const mediaJ = extraerMedia(msg, true); // miniatura (panel/visión)
    const mediaJreal = extraerMedia(msg, false); // archivo real (reproducir)

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

    // Vídeo/animación: guarda el archivo REAL para reproducirlo en el panel.
    // Best-effort: si la columna full_file_id aún no existe, se ignora sin romper.
    if (
      miMsgId &&
      mediaJreal &&
      (mediaJreal.media_type === "video" || mediaJreal.media_type === "animation")
    ) {
      await supabaseAdmin
        .from("bot_messages")
        .update({ full_file_id: mediaJreal.file_id })
        .eq("id", miMsgId)
        .then(() => {}, () => {});
    }

    // SOLO cortesía/cierre ("ok", "gracias", "mañana te digo") sin media: no
    // respondemos. Se calcula ANTES del debounce para no gastar 4,5s + query en
    // un mensaje que nunca va a contestar.
    const soloCierre =
      esSoloCierre(entrada) && !msg.photo && !msg.video && !msg.animation && !msg.document;

    // PIENSA ANTES DE RESPONDER (agrupa mensajes seguidos): esperamos unos segundos;
    // si mientras tanto el jugador manda OTRO mensaje (p. ej. foto y luego texto),
    // ESTE no responde y deja que responda el último, que ya tendrá TODO el contexto.
    // Evita la doble respuesta. Solo cuando vamos a responder con la IA.
    let debounced = false;
    if (entrada && iaConfigurada() && !limitado && !videoEnviado && !soloCierre && miMsgId) {
      tgApi("sendChatAction", { chat_id: chatId, action: "typing" }, tok).catch(() => {});
      await new Promise((r) => setTimeout(r, 4500));
      const { data: masNuevos } = await supabaseAdmin
        .from("bot_messages")
        .select("id, content, media_type")
        .eq("bot", bot.key)
        .eq("chat_id", chatId)
        .eq("role", "user")
        .gt("id", miMsgId)
        .order("id", { ascending: true })
        .limit(10);
      // Nos callamos solo si hay un mensaje posterior REAL: con MEDIA (foto/vídeo,
      // aunque su pie sea "gracias") o con texto que NO es pura cortesía. Un
      // "gracias" de texto suelto NO cuenta; una foto SÍ (para no responder dos veces).
      if (
        masNuevos &&
        masNuevos.some((m) => m.media_type || !esSoloCierre(String(m.content ?? "")))
      ) {
        debounced = true;
      }
    }

    // La IA responde (si no está limitada, dentro del tope y no ha quedado debounced).
    const TOPE_DIA = 5000;
    let respuesta: string | null = null;
    let promo = "";
    if (entrada && iaConfigurada() && !limitado && !videoEnviado && !debounced && !soloCierre) {
      tgApi("sendChatAction", { chat_id: chatId, action: "typing" }, tok).catch(() => {});
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(
        new Date()
      );
      const { data: usoActual } = await supabaseAdmin.rpc("increment_bot_ai_daily", {
        p_bot: bot.key,
        p_day: hoy,
      });
      const dentroTope = typeof usoActual !== "number" || usoActual <= TOPE_DIA;
      // Cap DIARIO POR CHAT (mismo que Sandro): un solo jugador no acapara el cupo
      // global de IA del bot. 200/día por chat, holgado para un real, frena el abuso.
      const dentroCapChat = dentroTope
        ? await rateLimitShared(`aichat:${bot.key}:${chatId}`, 200, 24 * 60 * 60 * 1000)
        : false;
      if (dentroTope && dentroCapChat) {
        // Memoria de la charla (AHORA, tras el debounce → incluye los mensajes que
        // el jugador mandó agrupados). Filtramos el mensaje ACTUAL (miMsgId): ese
        // va aparte como `entrada` para no duplicarlo.
        const desde = contacto?.memory_reset_at ?? "1970-01-01T00:00:00Z";
        const { data: prev } = await supabaseAdmin
          .from("bot_messages")
          .select("id, role, content, created_at")
          .eq("bot", bot.key)
          .eq("chat_id", chatId)
          .gt("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(120);
        const prevRows = ((prev ?? []) as { id: number; role: string; content: string; created_at: string }[])
          .filter((m) => (m.role === "user" || m.role === "assistant") && !!m.content && m.id !== miMsgId);
        const ultimoTs = prevRows.length ? new Date(prevRows[0].created_at).getTime() : null;
        huecoAhora = ultimoTs != null ? marcaHueco(Date.now() - ultimoTs) : "";
        let prevT: number | null = null;
        historial = [...prevRows].reverse().map((m) => {
          const t = new Date(m.created_at).getTime();
          const marca = prevT != null ? marcaHueco(t - prevT) : "";
          prevT = t;
          return { role: m.role as "user" | "assistant", content: marca + m.content };
        });

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
          huecoAhora + entrada,
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
      /jug|entr|deposit|recarg|vuelve|enlace|link|registr|apuest|patr|v[ií]deo|cuadr|\bmin[ae]s?\b|casino|promo|bono|empez|quiero|gan[ao]|d[oó]nde|m[aá]ndame|p[aá]same|\b20\b|\b30\b|\b100\b|\b150\b/i;
    if (respuesta) {
      // ⏳ Retardo "humano" VARIABLE antes de enviar (ver webhook de Sandro):
      // aleatorio + proporcional al texto, con "escribiendo…", para no clavar
      // siempre el mismo tiempo (eso canta a bot).
      const escribir =
        2000 + Math.floor(Math.random() * 5000) + Math.min(3500, respuesta.length * 30);
      tgApi("sendChatAction", { chat_id: chatId, action: "typing" }, tok).catch(() => {});
      await new Promise((r) => setTimeout(r, escribir));
      const invita = intencionJugar.test(respuesta) || intencionJugar.test(textoJ);
      await tgEnviar(
        chatId,
        respuesta,
        { parse_mode: undefined, ...(invita ? { reply_markup: botonSoloJugar(bot.enlace) } : {}) },
        tok
      );
    } else if (entrada && !limitado && !videoEnviado && !debounced && !soloCierre) {
      // ⛔ !soloCierre: ante cortesía pura ("gracias/ok/vale") NO soltamos el pitch.
      await tgEnviar(
        chatId,
        "¡Dale! 🔥 Recarga y entra a jugar 👇",
        { reply_markup: botonSoloJugar(bot.enlace) },
        tok
      );
    }

    if (respuesta || videoEnviado) {
      const { data: insA } = await supabaseAdmin
        .from("bot_messages")
        .insert({
          bot: bot.key,
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
          .from("bot_messages")
          .update({ full_file_id: videoEnviadoFileId, media_type: videoEnviadoTipo })
          .eq("id", insAId)
          .then(() => {}, () => {});
      }
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
