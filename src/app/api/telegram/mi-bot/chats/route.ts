import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { botPorTracking } from "@/lib/bots";

// Lista de conversaciones del BOT del afiliado (Jeffer, Mariam/Livana, Black KP).
// Cada afiliado ve SOLO los chats de su bot (se filtra por bot.key). Devuelve la
// MISMA forma que /api/telegram/contacts (con vista previa del último mensaje,
// origen y etiqueta) para que el afiliado use el mismo visor estilo WhatsApp que
// el admin y Yaiza, pero limitado a su propio bot.
type MsgFila = { chat_id: number; role: string; content: string | null; media_type: string | null };

export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("freshaffs_tracking_code")
    .eq("user_id", user.id)
    .maybeSingle();
  const bot = botPorTracking(aff?.freshaffs_tracking_code);
  if (!bot) return NextResponse.json({ tieneBot: false, jugadores: [] });

  const { data: contactos } = await supabaseAdmin
    .from("bot_contacts")
    .select("chat_id, first_name, username, last_msg_at, opted_out, silenced")
    .eq("bot", bot.key)
    .order("last_msg_at", { ascending: false, nullsFirst: false })
    .limit(150);

  // Vista previa del último mensaje de cada chat (estilo WhatsApp). Preferimos el
  // RPC bot_ultimos (1 fila por chat, sin bajar miles); si no existe aún, fallback
  // a la consulta antigua (limit 4000 reducido en memoria).
  const ids = (contactos ?? []).map((c) => c.chat_id as number);
  let msgs: MsgFila[] = [];
  if (ids.length) {
    const rpc = await supabaseAdmin.rpc("bot_ultimos", { p_bot: bot.key, p_ids: ids });
    if (!rpc.error && Array.isArray(rpc.data)) {
      msgs = rpc.data as MsgFila[];
    } else {
      const q = await supabaseAdmin
        .from("bot_messages")
        .select("chat_id, role, content, media_type")
        .eq("bot", bot.key)
        .in("chat_id", ids)
        .order("created_at", { ascending: false })
        .limit(4000);
      msgs = (q.data as MsgFila[] | null) ?? [];
    }
  }

  const prev = new Map<number, { texto: string; rol: string }>();
  for (const x of (msgs ?? []) as MsgFila[]) {
    if (prev.has(x.chat_id)) continue; // el más nuevo (vienen desc)
    const media = x.media_type ? (x.media_type === "photo" ? "📷 Foto" : "🎬 Vídeo") : "";
    const texto = (x.content || media || "").replace(/\s+/g, " ").trim().slice(0, 70);
    prev.set(x.chat_id, { texto, rol: x.role });
  }

  const jugadores = (contactos ?? []).map((f) => ({
    ...f,
    origen: bot.key,
    bot_nombre: bot.label,
    ultimo: prev.get(f.chat_id as number)?.texto ?? null,
    ultimo_rol: prev.get(f.chat_id as number)?.rol ?? null,
  }));

  return NextResponse.json({ tieneBot: true, jugadores });
}
