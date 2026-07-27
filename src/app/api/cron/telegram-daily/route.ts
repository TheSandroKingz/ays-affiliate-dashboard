import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tgApi, telegramConfigurado, botonJugar } from "@/lib/telegram";

// Cron del mensaje diario. Vercel (plan gratis) solo dispara 1 vez/día por cron
// y solo en UTC, así que lo llamamos a varias horas UTC (12,13,19,20) y aquí
// decidimos por la HORA DE MADRID: solo enviamos a las 14:00 y 21:00. Así se
// ajusta solo a verano/invierno (cambio de hora) sin tocar nada.
// A las 14:00 además reactivamos a los jugadores dormidos.

function horaMadrid(): number {
  return Number(
    new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  );
}

// Escribe a los jugadores que llevan días sin actividad (máx 1 vez por semana).
async function reactivarDormidos() {
  const ahora = Date.now();
  const { data } = await supabaseAdmin
    .from("telegram_contacts")
    .select("chat_id, first_name, last_msg_at, last_poke_at")
    .eq("opted_out", false);

  const dormidos = (data ?? []).filter((c) => {
    const inactivo =
      !c.last_msg_at || new Date(c.last_msg_at).getTime() < ahora - 3 * 864e5;
    const pokeOk =
      !c.last_poke_at || new Date(c.last_poke_at).getTime() < ahora - 7 * 864e5;
    return inactivo && pokeOk;
  });
  if (!dormidos.length) return 0;

  const picados: number[] = [];
  const bloqueados: number[] = [];
  for (let i = 0; i < dormidos.length; i += 25) {
    const tanda = dormidos.slice(i, i + 25);
    await Promise.all(
      tanda.map(async (c) => {
        const nombre = c.first_name ? ` ${c.first_name}` : "";
        const r = await tgApi("sendMessage", {
          chat_id: c.chat_id,
          text: `¡Klk manito${nombre}! 👋 Hace días que no te veo activo por aquí, ¿todo bien? Dale que hay movidas 🔥`,
          parse_mode: "HTML",
          reply_markup: botonJugar(),
        });
        if (r?.ok) picados.push(c.chat_id as number);
        else if (r && /blocked|deactivated|kicked/i.test(r.description ?? "")) {
          bloqueados.push(c.chat_id as number);
        }
      })
    );
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
  return picados.length;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!telegramConfigurado()) {
    return NextResponse.json({ error: "Bot no configurado" }, { status: 200 });
  }

  // Solo actuamos a las 14:00 y 21:00 hora de Madrid (el resto de disparos UTC
  // caen en otra hora local y no hacen nada).
  const hora = horaMadrid();
  if (hora !== 14 && hora !== 21) {
    return NextResponse.json({ ok: true, enviado: false, motivo: `hora Madrid ${hora}, fuera de 14/21` });
  }

  // A mediodía (14:00) reactivamos dormidos.
  let reactivados = 0;
  if (hora === 14) reactivados = await reactivarDormidos();

  const { data: diario } = await supabaseAdmin
    .from("telegram_daily")
    .select("media_type, file_id, caption, enabled")
    .eq("id", 1)
    .maybeSingle();

  if (!diario || !diario.enabled || (!diario.file_id && !diario.caption)) {
    return NextResponse.json({ ok: true, enviado: false, reactivados, motivo: "sin mensaje diario activo" });
  }

  const { data: contactos } = await supabaseAdmin
    .from("telegram_contacts")
    .select("chat_id")
    .eq("opted_out", false);
  const ids = (contactos ?? []).map((c) => c.chat_id as number);

  const caption = diario.caption || undefined;
  const boton = botonJugar();
  // Método de Telegram según el tipo de archivo. Todos con el botón "JUGAR AQUÍ".
  function payload(chatId: number): { metodo: string; params: Record<string, unknown> } {
    switch (diario!.media_type) {
      case "video":
        return { metodo: "sendVideo", params: { chat_id: chatId, video: diario!.file_id, caption, parse_mode: "HTML", reply_markup: boton } };
      case "animation":
        return { metodo: "sendAnimation", params: { chat_id: chatId, animation: diario!.file_id, caption, parse_mode: "HTML", reply_markup: boton } };
      case "photo":
        return { metodo: "sendPhoto", params: { chat_id: chatId, photo: diario!.file_id, caption, parse_mode: "HTML", reply_markup: boton } };
      case "document":
        return { metodo: "sendDocument", params: { chat_id: chatId, document: diario!.file_id, caption, parse_mode: "HTML", reply_markup: boton } };
      default:
        return { metodo: "sendMessage", params: { chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: boton } };
    }
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
  }

  if (bloqueados.length) {
    await supabaseAdmin
      .from("telegram_contacts")
      .update({ opted_out: true })
      .in("chat_id", bloqueados);
  }

  return NextResponse.json({ ok: true, enviado: true, hora, enviados, fallos, reactivados, total: ids.length });
}
