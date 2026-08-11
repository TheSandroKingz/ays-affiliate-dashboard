import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/adminAuth";
import { getBot } from "@/lib/bots";
import { tgApi } from "@/lib/telegram";

// Cambia el NOMBRE VISIBLE de un bot en Telegram (el que sale arriba del chat),
// vía setMyName con el token del bot. NO cambia el @usuario (eso solo se hace en
// @BotFather). Solo admin. Corre en el servidor, que tiene el token en Vercel.
export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const key = String(body?.key ?? "").trim();
  const name = String(body?.name ?? "").trim();
  if (!key || !name) {
    return NextResponse.json({ error: "Falta key o name." }, { status: 400 });
  }
  if (name.length > 64) {
    return NextResponse.json({ error: "El nombre es demasiado largo (máx 64)." }, { status: 400 });
  }
  const bot = getBot(key);
  if (!bot || !bot.token) {
    return NextResponse.json({ error: "Bot desconocido o sin token configurado." }, { status: 400 });
  }
  const r = await tgApi("setMyName", { name }, bot.token);
  if (!r || !r.ok) {
    return NextResponse.json(
      { ok: false, error: r?.description || "Telegram rechazó el cambio." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, name });
}
