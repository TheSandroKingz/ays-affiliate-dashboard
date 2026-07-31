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
import { compararSecreto } from "@/lib/secreto";
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
  // Verificación del secreto del webhook (comparación en tiempo constante).
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!compararSecreto(secret, process.env.TELEGRAM_WEBHOOK_SECRET)) {
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
      // Datos del contacto: silencio y corte de memoria.
      const { data: contacto } = await supabaseAdmin
        .from("telegram_contacts")
        .select("silenced, memory_reset_at")
        .eq("chat_id", chatId)
        .maybeSingle();
      // Silenciado por el dueño: el bot lo ignora del todo.
      if (contacto?.silenced) return NextResponse.json({ ok: true });

      // Límite: máx 8 mensajes de IA por minuto por usuario (protege el saldo de
      // Claude). ATÓMICO en BD: una ráfaga concurrente del mismo usuario no puede
      // saltárselo. Si la función aún no existe (SQL sin aplicar), no bloquea.
      const LIMITE_IA = 8;
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

      let videoEnviado = false;
      // Detecta que piden el patrón/método O que piden VER el vídeo o están
      // esperándolo (para no dejarlos colgados esperando: se lo mandamos).
      // Detecta que piden EL PATRÓN o piden VER el vídeo de forma clara. Ojo:
      // exigimos que "vídeo" vaya junto a una palabra de petición para NO
      // dispararse con quejas ("problema con el sistema de pago", "no me llega el
      // vídeo") ni silenciar a la IA cuando la persona necesita ayuda.
      const pidePatron =
        /patr[oó]n|cuadrad|cuadro|\btruco|c[oó]mo (le das|lo hac|juega)|(ens[eé][ñn]a|mu[eé]stra|m[aá]nda|quiero ver|ver el|en cu[aá]l|d[oó]nde|esperando)\s*(me|el|tu)?\s*(el|tu)?\s*v[ií]deo/i.test(
          textoJ
        );
      // OTRO ejemplo SOLO cuando el jugador MANDA un vídeo/clip de su jugada
      // (prueba de que perdió o está a punto). Un simple "no me funciona" por
      // texto NO basta: eso va a la IA, que le pide el vídeo. Así no regalamos
      // ejemplos sin que hayan jugado y mostrado el resultado.
      const mandoVideo = !!(msg.video || msg.animation);
      // Problema REAL (pagos, cuenta, verificación, bono…): eso va a la IA, NO se
      // le manda un ejemplo. Incluye el error de saldo de bono ("can not make a bet").
      const problemaReal =
        /retir|cobr|\bpag|dep[oó]sito|cuenta|verific|bloque|correo|email|bono|bonus|can ?not|make a bet|saldo|reclamaci|estafa/i.test(
          textoJ
        );
      // Mandamos un EJEMPLO si: piden el patrón/vídeo, O mandan un vídeo de su
      // jugada → le damos OTRA forma. Nunca en un problema real (pago/cuenta/bono).
      if ((pidePatron || mandoVideo) && !problemaReal && !limitado) {
        // 1º un EJEMPLO al azar de la biblioteca del dueño (rotando, "así juego
        // yo"); si no hay ninguno, el /diario; y si tampoco, el de bienvenida.
        let dv:
          | { media_type: string | null; file_id: string | null; enabled: boolean | null }
          | null = null;
        const { data: ejs } = await supabaseAdmin
          .from("telegram_examples")
          .select("media_type, file_id")
          .eq("enabled", true)
          .limit(100000);
        if (ejs && ejs.length) {
          const pick = ejs[Math.floor(Math.random() * ejs.length)];
          dv = { media_type: pick.media_type, file_id: pick.file_id, enabled: true };
        }
        if (!dv) {
          const { data: diarioV } = await supabaseAdmin
            .from("telegram_daily")
            .select("media_type, file_id, enabled")
            .eq("id", 1)
            .maybeSingle();
          if (diarioV && diarioV.enabled && diarioV.file_id) dv = diarioV;
          else {
            const { data: bienvV } = await supabaseAdmin
              .from("telegram_welcome")
              .select("media_type, file_id, enabled")
              .eq("id", 1)
              .maybeSingle();
            if (bienvV && bienvV.enabled && bienvV.file_id) dv = bienvV;
          }
        }
        if (dv && dv.enabled && dv.file_id) {
          const m = dv.media_type;
          const metodo =
            m === "video" ? "sendVideo" : m === "animation" ? "sendAnimation" : m === "photo" ? "sendPhoto" : m === "document" ? "sendDocument" : "sendMessage";
          const p: Record<string, unknown> = {
            chat_id: chatId,
            // Si mandó su vídeo (jugada/pérdida), se lo damos como OTRA forma. En
            // ambos casos dejamos con ganas de ver MÁS (tengo varias formas).
            caption: mandoVideo
              ? "Toma, prueba así también 🔥 es OTRA de mis formas. Tengo varias — mándame cómo te va y te paso la siguiente. Míralo y hazlo igual."
              : "Aquí tienes 🔥 así le doy yo. Tengo varias formas; hazlo igual que en esta y si acaso me enseñas cómo te fue y te paso otra.",
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
        textoJ ||
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
        .limit(60);
      const historial: Turno[] = ((prev ?? []) as { role: string; content: string }[])
        .reverse()
        .filter((m) => (m.role === "user" || m.role === "assistant") && !!m.content)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      // Si el jugador manda una foto/vídeo, guardamos su file_id + tipo para
      // poder MOSTRARLO en el visor de chats del panel (el socio ve la imagen).
      const fotosMsg = msg.photo as Array<{ file_id: string }> | undefined;
      const mediaFileId =
        fotosMsg && fotosMsg.length
          ? fotosMsg[fotosMsg.length - 1].file_id
          : (msg.video?.file_id ??
             msg.animation?.file_id ??
             msg.document?.file_id ??
             null);
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

      // Guardamos YA el mensaje del jugador (antes de responder): si manda otro
      // mensaje seguido, ese contexto ya estará disponible para el segundo.
      await supabaseAdmin
        .from("telegram_messages")
        .insert({
          chat_id: chatId,
          role: "user",
          content: entrada || "(envió algo)",
          file_id: mediaFileId,
          media_type: mediaTipo,
        })
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
        if (dentroTope) {
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
        /jug|entr|deposit|recarg|vuelve|enlace|link|registr|apuest|patr|v[ií]deo|cuadr|min[ae]s?|casino|promo|bono|empez|quiero|gan[ao]|d[oó]nde|m[aá]ndame|p[aá]same|\b20\b|\b30\b|\b100\b|\b150\b/i;
      // Guardamos el mensaje del jugador para la limpieza automática de chats.
      await guardarMsg(chatId, msg.message_id);
      if (respuesta) {
        const invita =
          intencionJugar.test(respuesta) || intencionJugar.test(textoJ);
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
      // Si el jugador está LIMITADO (spam, >8/min), no te reenviamos cada mensaje
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
