import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { tgApi, telegramConfigurado, botonJugar, OWNER_CHAT_ID } from "@/lib/telegram";
import { generarMensajeDiario } from "@/lib/telegramAI";

// Prueba del envío diario: genera el mensaje de hoy con la IA y te lo manda
// SOLO A TI (al dueño), no a los jugadores. Así ves un ejemplo real.
export async function POST(request: Request) {
  const admin = await getAdminUser(request);
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!telegramConfigurado()) {
    return NextResponse.json({ error: "Bot no configurado." }, { status: 500 });
  }
  if (!OWNER_CHAT_ID) {
    return NextResponse.json({ error: "Falta TELEGRAM_OWNER_CHAT_ID." }, { status: 500 });
  }

  const texto = await generarMensajeDiario("mensaje de prueba");
  if (!texto) {
    return NextResponse.json({
      error: "La IA no generó texto (revisa ANTHROPIC_API_KEY con 'Probar bot').",
    });
  }

  const { data: diario } = await supabaseAdmin
    .from("telegram_daily")
    .select("media_type, file_id, enabled")
    .eq("id", 1)
    .maybeSingle();
  const tieneMedia = !!(diario && diario.enabled && diario.file_id);

  const boton = botonJugar();
  const cap = `🧪 <i>PRUEBA (solo la ves tú)</i>\n\n${texto}`;
  let r;
  if (tieneMedia) {
    const m = diario!.media_type;
    const metodo =
      m === "video" ? "sendVideo" : m === "animation" ? "sendAnimation" : m === "photo" ? "sendPhoto" : m === "document" ? "sendDocument" : "sendMessage";
    const params: Record<string, unknown> = { chat_id: OWNER_CHAT_ID, caption: cap, parse_mode: "HTML", reply_markup: boton };
    if (m === "video") params.video = diario!.file_id;
    else if (m === "animation") params.animation = diario!.file_id;
    else if (m === "photo") params.photo = diario!.file_id;
    else if (m === "document") params.document = diario!.file_id;
    r = await tgApi(metodo, params);
  } else {
    r = await tgApi("sendMessage", {
      chat_id: OWNER_CHAT_ID,
      text: cap,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: boton,
    });
  }

  return NextResponse.json({
    ok: !!r?.ok,
    con_video: tieneMedia,
    texto,
    error: r?.description ?? null,
  });
}
