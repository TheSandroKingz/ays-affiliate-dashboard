import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { tgApi, telegramConfigurado, botonJugar } from "@/lib/telegram";
import { generarMensajeDiario } from "@/lib/telegramAI";

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
        if (r?.ok) picados.push(c.chat_id as number);
        else if (r && /blocked|deactivated|kicked/i.test(r.description ?? "")) {
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

export async function GET(request: Request) {
  // Lo llama Vercel (cron, con CRON_SECRET) o el dueño desde el panel (admin).
  const authHeader = request.headers.get("authorization");
  const esCron =
    !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const admin = esCron ? true : !!(await getAdminUser(request));
  if (!esCron && !admin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!telegramConfigurado()) {
    return NextResponse.json({ error: "Bot no configurado" }, { status: 200 });
  }

  // Envíos: el fijo de las 20:00 (siempre) y un extra a las 13:00 SOLO los
  // findes y días de cobro. El dueño también puede forzar el envío ya.
  const force = !esCron && new URL(request.url).searchParams.get("force") === "1";
  const hora = horaMadrid();
  const esExtra = hora === 13 && esFindeOCobro();
  if (!force && hora !== 20 && !esExtra) {
    return NextResponse.json({ ok: true, enviado: false, motivo: `hora Madrid ${hora}, sin envío` });
  }

  // Limpieza: borramos los update_id anti-duplicados de más de 1 día.
  await supabaseAdmin
    .from("telegram_updates")
    .delete()
    .lt("created_at", new Date(Date.now() - 864e5).toISOString())
    .then(() => {}, () => {});

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
        if (r?.ok) enviados++;
        else {
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
