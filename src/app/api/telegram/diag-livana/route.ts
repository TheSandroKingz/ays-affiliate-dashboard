import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getBot } from "@/lib/bots";
import { tgApi } from "@/lib/telegram";
import { compararSecreto } from "@/lib/secreto";
import { extraerMedia } from "@/lib/botHandler";

// TEMPORAL: lee la config de bienvenida del bot de Livana (mariam) e intenta
// enviarla, devolviendo el error EXACTO de Telegram. Solo con secreto. BORRAR.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const s = url.searchParams.get("s") || "";
  const bot = getBot("mariam");
  if (!bot) return NextResponse.json({ error: "no bot mariam" });
  if (!compararSecreto(s, bot.secret)) return NextResponse.json({ error: "secreto mal" });
  const chat = Number(url.searchParams.get("chat") || 5394835324);

  const { data: cfg } = await supabaseAdmin
    .from("bot_config")
    .select("welcome_text, welcome_media_type, welcome_file_id, welcome_enabled")
    .eq("bot", "mariam")
    .maybeSingle();

  const fid = (cfg?.welcome_file_id as string | undefined) ?? undefined;
  const mt = (cfg?.welcome_media_type as string | undefined) ?? undefined;

  const map: Record<string, [string, string]> = {
    video: ["sendVideo", "video"],
    animation: ["sendAnimation", "animation"],
    photo: ["sendPhoto", "photo"],
    document: ["sendDocument", "document"],
  };
  const results: Record<string, unknown> = {};
  if (fid) {
    // 1) Intento con el método que toca según media_type
    const [metodo, campo] = map[mt ?? "video"] ?? ["sendVideo", "video"];
    const p1: Record<string, unknown> = { chat_id: chat, caption: "diag 1" };
    p1[campo] = fid;
    const r1 = await tgApi(metodo, p1, bot.token);
    results.comoTipo = { metodo, ok: r1?.ok, description: r1?.description };
    // 2) Intento como FOTO (si el file_id fuese en realidad una miniatura)
    const r2 = await tgApi("sendPhoto", { chat_id: chat, photo: fid, caption: "diag 2 (como foto)" }, bot.token);
    results.comoFoto = { ok: r2?.ok, description: r2?.description };
  }
  // Auto-test: ¿el código en vivo guarda el file_id REAL de un vídeo (no la
  // miniatura)? Si devuelve "REAL_VID" el arreglo está activo; si "THUMB" no.
  const test = extraerMedia({
    video: { file_id: "REAL_VID", thumbnail: { file_id: "THUMB" } },
  } as unknown as Record<string, unknown>);

  return NextResponse.json({
    welcome_enabled: cfg?.welcome_enabled ?? null,
    welcome_media_type: mt ?? null,
    file_id_prefijo: fid ? fid.slice(0, 12) : null,
    file_id_len: fid?.length ?? 0,
    tiene_texto: !!cfg?.welcome_text,
    arregloActivo: test?.file_id === "REAL_VID",
    testDevuelve: test?.file_id ?? null,
    results,
  });
}
