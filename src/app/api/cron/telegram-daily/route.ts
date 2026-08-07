import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser, ADMIN_USER_ID } from "@/lib/adminAuth";
import { compararSecreto } from "@/lib/secreto";
import { tgApi, telegramConfigurado, botonJugar, guardarMsg, midDe, ENLACES_PAUSADOS } from "@/lib/telegram";
import { generarMensajeDiario } from "@/lib/telegramAI";
import { BOTS } from "@/lib/bots";
import { resumenSeguridad } from "@/lib/seguridad";
import { enviarPush } from "@/lib/push";

// Damos margen: la IA + envíos + limpieza no deben cortarse a medias.
export const maxDuration = 60;

// Cron del mensaje diario. Vercel (plan gratis) solo dispara 1 vez/día por cron
// y solo en UTC, así que lo llamamos a 18 y 19 UTC y aquí decidimos por la HORA
// DE MADRID: solo enviamos a las 20:00. Así se ajusta solo a verano/invierno
// (cambio de hora). Además reactivamos a los dormidos (sin doblar mensaje).

function horaMadrid(): number {
  return Number(
    new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  );
}

// ¿Hoy es finde (vie/sáb/dom) o día de cobro (día 1 o del 28 en adelante)?
// Son los momentos con más dinero → mandamos un empujón extra a mediodía.
function esFindeOCobro(): boolean {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "2-digit",
  }).formatToParts(new Date());
  const wd = p.find((x) => x.type === "weekday")?.value ?? "";
  const day = Number(p.find((x) => x.type === "day")?.value ?? "0");
  const finde = wd === "Fri" || wd === "Sat" || wd === "Sun";
  const cobro = day === 1 || day >= 28;
  return finde || cobro;
}

// Escribe a los jugadores que llevan días sin actividad (máx 1 vez por semana).
// Devuelve los chat_id a los que sí escribió, para NO doblarles el envío diario.
async function reactivarDormidos(): Promise<number[]> {
  const ahora = Date.now();
  const { data } = await supabaseAdmin
    .from("telegram_contacts")
    .select("chat_id, first_name, last_msg_at, last_poke_at")
    .eq("opted_out", false)
    .eq("silenced", false);

  const dormidos = (data ?? []).filter((c) => {
    const inactivo =
      !c.last_msg_at || new Date(c.last_msg_at).getTime() < ahora - 3 * 864e5;
    const pokeOk =
      !c.last_poke_at || new Date(c.last_poke_at).getTime() < ahora - 7 * 864e5;
    return inactivo && pokeOk;
  });
  if (!dormidos.length) return [];

  const picados: number[] = [];
  const bloqueados: number[] = [];
  for (let i = 0; i < dormidos.length; i += 25) {
    const tanda = dormidos.slice(i, i + 25);
    await Promise.all(
      tanda.map(async (c) => {
        const nombre = c.first_name ? ` ${c.first_name}` : "";
        const r = await tgApi("sendMessage", {
          chat_id: c.chat_id,
          text: `¡Hey${nombre}! 👋 Hace días que no te veo por aquí, ¿todo bien? Dale que hay cosas buenas 🔥`,
          reply_markup: botonJugar(),
        });
        if (r?.ok) {
          picados.push(c.chat_id as number);
          await guardarMsg(c.chat_id as number, midDe(r));
        } else if (r && /blocked|deactivated|kicked/i.test(r.description ?? "")) {
          bloqueados.push(c.chat_id as number);
        }
      })
    );
    if (i + 25 < dormidos.length) await new Promise((r) => setTimeout(r, 1000));
  }
  if (picados.length) {
    await supabaseAdmin
      .from("telegram_contacts")
      .update({ last_poke_at: new Date().toISOString() })
      .in("chat_id", picados);
  }
  if (bloqueados.length) {
    await supabaseAdmin
      .from("telegram_contacts")
      .update({ opted_out: true })
      .in("chat_id", bloqueados);
  }
  return picados;
}

// Mensaje diario de los BOTS NUEVOS (Jeffer, Alana): envía el /diario que el
// dueño dejó en bot_config a los contactos de cada bot (con SU token/enlace), y
// limpia sus tablas (bot_updates/bot_ai_daily crecían sin cota). Idempotente por
// bot y día. BLINDADO: un bot que falle no rompe a los demás ni al de Sandro.
async function procesarBotsDiario(diaMadrid: string, force = false): Promise<void> {
  // Limpieza global de las tablas bot_* que crecen sin cota.
  await supabaseAdmin
    .from("bot_updates")
    .delete()
    .lt("created_at", new Date(Date.now() - 2 * 864e5).toISOString())
    .then(() => {}, () => {});
  await supabaseAdmin
    .from("bot_ai_daily")
    .delete()
    .lt("day", new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10))
    .then(() => {}, () => {});

  for (const bot of Object.values(BOTS)) {
    if (!bot.token) continue;
    try {
      // Idempotencia por bot y día (misma tabla que el de Sandro). El envío
      // MANUAL (force) del dueño no se frena, para poder reenviar a mano.
      if (!force) {
        const clave = `botdiario:${bot.key}:${diaMadrid}`;
        const { data: ins, error } = await supabaseAdmin
          .from("telegram_envio_diario")
          .upsert({ clave }, { onConflict: "clave", ignoreDuplicates: true })
          .select("clave");
        if (!error && ins && ins.length === 0) continue; // ya enviado hoy
      }

      const { data: cfg } = await supabaseAdmin
        .from("bot_config")
        .select("daily_media_type, daily_file_id, daily_caption, daily_enabled")
        .eq("bot", bot.key)
        .maybeSingle();
      if (!cfg || cfg.daily_enabled === false) continue;
      const tieneMedia = !!cfg.daily_file_id;
      const caption = (cfg.daily_caption as string) || undefined;
      if (!tieneMedia && !caption) continue; // nada configurado para este bot

      const { data: contactos } = await supabaseAdmin
        .from("bot_contacts")
        .select("chat_id")
        .eq("bot", bot.key)
        .eq("opted_out", false)
        .eq("silenced", false);
      const ids = (contactos ?? []).map((c) => c.chat_id as number);
      const boton = botonJugar(bot.enlace);
      const bloq: number[] = [];
      for (let i = 0; i < ids.length; i += 25) {
        const tanda = ids.slice(i, i + 25);
        await Promise.all(
          tanda.map(async (chatId) => {
            const t = cfg.daily_media_type;
            const metodo = tieneMedia
              ? t === "video" ? "sendVideo" : t === "animation" ? "sendAnimation" : t === "photo" ? "sendPhoto" : t === "document" ? "sendDocument" : "sendMessage"
              : "sendMessage";
            const p: Record<string, unknown> = tieneMedia
              ? { chat_id: chatId, caption, reply_markup: boton }
              : { chat_id: chatId, text: caption, disable_web_page_preview: true, reply_markup: boton };
            if (tieneMedia) {
              const campo = t === "video" ? "video" : t === "animation" ? "animation" : t === "photo" ? "photo" : "document";
              p[campo] = cfg.daily_file_id;
            }
            const r = await tgApi(metodo, p, bot.token);
            if (r && !r.ok && /blocked|deactivated|kicked/i.test(r.description ?? "")) {
              bloq.push(chatId);
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
    } catch {
      /* un bot no rompe a los demás */
    }
  }
}

export async function GET(request: Request) {
  // Lo llama Vercel (cron, con CRON_SECRET) o el dueño desde el panel (admin).
  const authHeader = request.headers.get("authorization");
  const esCron = compararSecreto(
    authHeader?.replace("Bearer ", ""),
    process.env.CRON_SECRET
  );
  const admin = esCron ? true : !!(await getAdminUser(request));
  if (!esCron && !admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // VIGILANTE anti doble-pago: si algún día se materializa un FTD duplicado (un
  // jugador contado dos veces que se escapó de los candados), avisamos al dueño.
  // Escanea en cada disparo del cron (barato), pero AVISA como MUCHO una vez al
  // día (reserva una clave por día) para no bombardear con 8 push. BLINDADO.
  try {
    const seg = await resumenSeguridad();
    if (seg.dobles > 0) {
      const diaMadrid = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Madrid",
      }).format(new Date());
      const { data: ins } = await supabaseAdmin
        .from("telegram_envio_diario")
        .upsert({ clave: `vigilante:${diaMadrid}` }, { onConflict: "clave", ignoreDuplicates: true })
        .select("clave");
      const primeraAlertaHoy = !ins || ins.length > 0;
      if (primeraAlertaHoy) {
        await enviarPush(ADMIN_USER_ID, {
          title: "⚠️ Posible FTD duplicado",
          body: `Hay ${seg.dobles} jugador(es) con un FTD contado 2 veces. Revísalo en Actividad para no pagar de más.`,
          url: "/admin/actividad",
        });
      }
    }
  } catch {
    /* la vigilancia nunca rompe el cron */
  }

  if (!telegramConfigurado()) {
    return NextResponse.json({ error: "Bot no configurado" }, { status: 200 });
  }

  // LIMPIEZA de chats: borra los mensajes de más de 40h (Telegram solo permite
  // borrar hasta 48h). La bienvenida no se guarda, así que NUNCA se borra.
  // Corre en cada disparo del cron, aunque no toque enviar.
  {
    const cutoff = new Date(Date.now() - 40 * 3600 * 1000).toISOString();
    // Los MÁS ANTIGUOS primero (asc): así, si hay más de 2000, borramos en BD
    // solo hasta el último que procesamos, y los que sobran se limpian en la
    // siguiente pasada (antes se borraban de BD sin borrarlos del chat = quedaban
    // para siempre en Telegram).
    const { data: viejos } = await supabaseAdmin
      .from("telegram_sent")
      .select("chat_id, message_id, created_at")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(500); // tope bajo: la limpieza NO debe comerse el tiempo del envío
    if (viejos?.length) {
      for (let i = 0; i < viejos.length; i += 25) {
        const tanda = viejos.slice(i, i + 25);
        await Promise.all(
          tanda.map((m) =>
            tgApi("deleteMessage", { chat_id: m.chat_id, message_id: m.message_id })
          )
        );
        // Pausa corta entre tandas (antes 1s × 80 tandas ≈ 80s > límite de 60s,
        // y el diario no se enviaba). Ahora máx ~6s de limpieza.
        if (i + 25 < viejos.length) await new Promise((r) => setTimeout(r, 250));
      }
      const ultimo = viejos[viejos.length - 1].created_at as string;
      await supabaseAdmin
        .from("telegram_sent")
        .delete()
        .lte("created_at", ultimo);
    }
  }

  // ⛔ PAUSA (FreshBet cortó el tráfico): NO se manda NADA promocional — ni el
  // mensaje diario, ni el vídeo, ni el "hey vuelve" a los dormidos, ni el diario
  // de los bots nuevos. La vigilancia anti-doble-pago y la limpieza de chats de
  // arriba SÍ siguen corriendo. Al reactivar el casino, poner ENLACES_PAUSADOS=false.
  if (ENLACES_PAUSADOS) {
    return NextResponse.json({ ok: true, enviado: false, motivo: "pausa: sin envíos promocionales (FreshBet cortado)" });
  }

  // Envíos: el fijo de las 20:00 (siempre) y un extra a las 13:00 SOLO los
  // findes y días de cobro. El dueño también puede forzar el envío ya.
  const force = !esCron && new URL(request.url).searchParams.get("force") === "1";
  const hora = horaMadrid();
  const esExtra = hora === 13 && esFindeOCobro();
  if (!force && hora !== 20 && !esExtra) {
    return NextResponse.json({ ok: true, enviado: false, motivo: `hora Madrid ${hora}, sin envío` });
  }

  // Idempotencia: los cron de Vercel pueden dispararse dos veces (at-least-once).
  // Reservamos la franja del día (atómico) para no reenviar el masivo por
  // duplicado. El envío MANUAL (force) no se frena. BLINDADO: si la tabla aún no
  // existe, no bloquea (se envía igual).
  if (!force) {
    const diaMadrid = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
    }).format(new Date());
    const clave = `${diaMadrid}-${esExtra ? "extra" : "noche"}`;
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("telegram_envio_diario")
      .upsert({ clave }, { onConflict: "clave", ignoreDuplicates: true })
      .select("clave");
    if (!insErr && ins && ins.length === 0) {
      return NextResponse.json({ ok: true, enviado: false, motivo: "ya enviado esta franja" });
    }
  }

  // Limpieza: borramos los update_id anti-duplicados de más de 1 día.
  await supabaseAdmin
    .from("telegram_updates")
    .delete()
    .lt("created_at", new Date(Date.now() - 864e5).toISOString())
    .then(() => {}, () => {});
  // Y las claves de franja de envío de más de 3 días (ya no hacen falta).
  await supabaseAdmin
    .from("telegram_envio_diario")
    .delete()
    .lt("created_at", new Date(Date.now() - 3 * 864e5).toISOString())
    .then(() => {}, () => {});

  // BOTS NUEVOS (Jeffer/Alana): envían su propio /diario y limpian sus tablas.
  // SOLO en el envío de la noche (hora===20) o forzado, para que salga a las
  // 20:00 como el de Sandro (no a mediodía en el envío extra de findes) y no se
  // duplique. Blindado (no rompe nada si falla).
  if (hora === 20 || force) {
    const diaMadrid = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
    }).format(new Date());
    await procesarBotsDiario(diaMadrid, force).catch(() => {});
  }

  // Reactivamos dormidos solo en el envío de la noche (1 vez/día), no en el extra.
  const picados = hora === 20 || force ? await reactivarDormidos() : [];
  const reactivados = picados.length;

  // La IA genera el texto del día (distinto cada vez). En finde/cobro, aprovecha.
  const fecha = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const contexto = esExtra
    ? `${fecha}. Es finde o día de cobro: la gente tiene dinero, anímalos con fuerza a aprovechar y entrar hoy`
    : `${fecha}, de noche`;
  const textoIA = await generarMensajeDiario(contexto);

  // Vídeo/foto opcional que el dueño dejó con /diario.
  const { data: diario } = await supabaseAdmin
    .from("telegram_daily")
    .select("media_type, file_id, enabled")
    .eq("id", 1)
    .maybeSingle();
  const tieneMedia = !!(diario && diario.enabled && diario.file_id);

  // Texto = el que genera la IA (sin necesidad de que tú lo escribas).
  const texto = textoIA;
  if (!tieneMedia && !texto) {
    return NextResponse.json({ ok: true, enviado: false, reactivados, motivo: "sin texto (IA) ni video" });
  }

  const { data: contactos } = await supabaseAdmin
    .from("telegram_contacts")
    .select("chat_id")
    .eq("opted_out", false)
    .eq("silenced", false);
  const yaPicados = new Set(picados);
  const ids = (contactos ?? [])
    .map((c) => c.chat_id as number)
    .filter((id) => !yaPicados.has(id));

  // El texto de la IA; 1 de cada 4 veces le añadimos el aviso de baja discreto.
  const caption = texto
    ? Math.random() < 0.25
      ? `${texto}\n\n/stop para salir`
      : texto
    : undefined;
  const boton = botonJugar();
  // Sin parse_mode: el texto lo escribe la IA y podría llevar un "<" que Telegram
  // rechazaría como HTML mal formado (y no se enviaría nada). Va en texto plano.
  function payload(chatId: number): { metodo: string; params: Record<string, unknown> } {
    if (tieneMedia) {
      switch (diario!.media_type) {
        case "video":
          return { metodo: "sendVideo", params: { chat_id: chatId, video: diario!.file_id, caption, reply_markup: boton } };
        case "animation":
          return { metodo: "sendAnimation", params: { chat_id: chatId, animation: diario!.file_id, caption, reply_markup: boton } };
        case "photo":
          return { metodo: "sendPhoto", params: { chat_id: chatId, photo: diario!.file_id, caption, reply_markup: boton } };
        case "document":
          return { metodo: "sendDocument", params: { chat_id: chatId, document: diario!.file_id, caption, reply_markup: boton } };
      }
    }
    return { metodo: "sendMessage", params: { chat_id: chatId, text: caption, disable_web_page_preview: true, reply_markup: boton } };
  }

  let enviados = 0;
  let fallos = 0;
  const bloqueados: number[] = [];

  for (let i = 0; i < ids.length; i += 25) {
    const tanda = ids.slice(i, i + 25);
    await Promise.all(
      tanda.map(async (chatId) => {
        const { metodo, params } = payload(chatId);
        const r = await tgApi(metodo, params);
        if (r?.ok) {
          enviados++;
          await guardarMsg(chatId, midDe(r));
        } else {
          fallos++;
          if (r && /blocked|deactivated|kicked/i.test(r.description ?? "")) {
            bloqueados.push(chatId);
          }
        }
      })
    );
    // Pausa entre tandas para que Telegram no nos frene en listas grandes.
    if (i + 25 < ids.length) await new Promise((r) => setTimeout(r, 1000));
  }

  if (bloqueados.length) {
    await supabaseAdmin
      .from("telegram_contacts")
      .update({ opted_out: true })
      .in("chat_id", bloqueados);
  }

  return NextResponse.json({ ok: true, enviado: true, hora, enviados, fallos, reactivados, total: ids.length });
}
