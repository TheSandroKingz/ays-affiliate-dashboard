import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser } from "@/lib/adminAuth";
import { tgApi, telegramConfigurado, botonJugar } from "@/lib/telegram";

// GET: nº de contactos activos (para el panel). POST: envía un mensaje a todos.
export async function GET(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const hace24h = new Date(Date.now() - 864e5).toISOString();
  const cuenta = (q: ReturnType<typeof filtroBase>) =>
    q.then((r) => r.count ?? 0);
  function filtroBase() {
    return supabaseAdmin
      .from("telegram_contacts")
      .select("chat_id", { count: "exact", head: true });
  }

  const [
    activos,
    total,
    bajas,
    silenciados,
    nuevos24h,
    escribieron24h,
    diarioRes,
    botRes,
  ] = await Promise.all([
    cuenta(filtroBase().eq("opted_out", false).eq("silenced", false)),
    cuenta(filtroBase()),
    cuenta(filtroBase().eq("opted_out", true)),
    cuenta(filtroBase().eq("silenced", true)),
    cuenta(filtroBase().gte("joined_at", hace24h)),
    cuenta(filtroBase().gte("last_msg_at", hace24h)),
    supabaseAdmin
      .from("telegram_daily")
      .select("media_type, enabled")
      .eq("id", 1)
      .maybeSingle(),
    // Depósitos/comisiones atribuidos al bot (afp=bot) ya contados: nº y € total.
    supabaseAdmin
      .from("postback_events")
      .select("commission")
      .eq("counted", true)
      .in("event_type", ["ftd", "commission"])
      .ilike("afp", "bot%"),
  ]);
  const diario = diarioRes.data;
  const filasBot = botRes.data ?? [];
  const depositosBot = filasBot.length;
  const eurBot = filasBot.reduce((s, r) => s + Number(r.commission ?? 0), 0);

  return NextResponse.json({
    contactos: activos,
    configurado: telegramConfigurado(),
    stats: {
      activos,
      total,
      bajas,
      silenciados,
      nuevos24h,
      escribieron24h,
      depositosBot,
      eurBot,
    },
    diario: diario
      ? { activo: !!diario.enabled, tipo: diario.media_type ?? null }
      : null,
  });
}

export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!telegramConfigurado()) {
    return NextResponse.json(
      { error: "Falta TELEGRAM_BOT_TOKEN en el servidor." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const texto = String(body?.texto ?? "").trim();
  const foto = body?.foto ? String(body.foto).trim() : "";
  if (!texto && !foto) {
    return NextResponse.json({ error: "El mensaje está vacío." }, { status: 400 });
  }
  if (texto.length > 4000) {
    return NextResponse.json({ error: "Mensaje demasiado largo (máx 4000)." }, { status: 400 });
  }

  const { data: contactos } = await supabaseAdmin
    .from("telegram_contacts")
    .select("chat_id")
    .eq("opted_out", false)
    .eq("silenced", false);
  const ids = (contactos ?? []).map((c) => c.chat_id as number);

  let enviados = 0;
  let fallos = 0;
  const bloqueados: number[] = [];

  // En tandas de 25 (Telegram permite ~30 mensajes/seg a usuarios distintos).
  for (let i = 0; i < ids.length; i += 25) {
    const tanda = ids.slice(i, i + 25);
    await Promise.all(
      tanda.map(async (chatId) => {
        const r = foto
          ? await tgApi("sendPhoto", {
              chat_id: chatId,
              photo: foto,
              caption: texto || undefined,
              parse_mode: "HTML",
              reply_markup: botonJugar(),
            })
          : await tgApi("sendMessage", {
              chat_id: chatId,
              text: texto,
              parse_mode: "HTML",
              disable_web_page_preview: true,
              reply_markup: botonJugar(),
            });
        if (r?.ok) enviados++;
        else {
          fallos++;
          // 403 = el usuario bloqueó el bot → lo damos de baja para no reintentar.
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

  return NextResponse.json({ ok: true, enviados, fallos, total: ids.length });
}
