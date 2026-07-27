import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tgApi, telegramConfigurado, botonJugar } from "@/lib/telegram";

// Cron diario: reenvía a todos los jugadores activos el "mensaje diario" que el
// dueño guardó con /diario (un vídeo/foto/texto). El contenido lo pone el dueño;
// aquí solo lo distribuimos. Protegido con CRON_SECRET (lo llama Vercel).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!telegramConfigurado()) {
    return NextResponse.json({ error: "Bot no configurado" }, { status: 200 });
  }

  const { data: diario } = await supabaseAdmin
    .from("telegram_daily")
    .select("media_type, file_id, caption, enabled")
    .eq("id", 1)
    .maybeSingle();

  if (!diario || !diario.enabled || (!diario.file_id && !diario.caption)) {
    return NextResponse.json({ ok: true, enviado: false, motivo: "sin mensaje diario activo" });
  }

  const { data: contactos } = await supabaseAdmin
    .from("telegram_contacts")
    .select("chat_id")
    .eq("opted_out", false);
  const ids = (contactos ?? []).map((c) => c.chat_id as number);

  const caption = diario.caption || undefined;
  const boton = botonJugar();
  // Elegimos el método de Telegram según el tipo de archivo. Todos llevan el
  // botón "JUGAR AQUÍ" que abre el enlace de depósito.
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

  // En tandas de 25 (Telegram permite ~30 mensajes/seg a usuarios distintos).
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

  return NextResponse.json({ ok: true, enviado: true, enviados, fallos, total: ids.length });
}
