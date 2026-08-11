import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser, getGestorBot } from "@/lib/adminAuth";

// GET: lista de jugadores (para el panel). Lo pueden LEER el admin y los gestores
// del bot (Yaiza). Junta los chats del bot de Sandro (telegram_contacts, origen
// "as") con los del bot de Jeffer (bot_contacts bot="jeffer", origen "jeffer"),
// cada uno etiquetado para saber de qué bot es. POST: silenciar — solo admin.
export async function GET(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [sandro, jeffer] = await Promise.all([
    supabaseAdmin
      .from("telegram_contacts")
      .select("chat_id, first_name, username, last_msg_at, opted_out, silenced")
      .order("last_msg_at", { ascending: false, nullsFirst: false })
      .limit(150),
    supabaseAdmin
      .from("bot_contacts")
      .select("chat_id, first_name, username, last_msg_at, opted_out, silenced")
      .eq("bot", "jeffer")
      .order("last_msg_at", { ascending: false, nullsFirst: false })
      .limit(150),
  ]);

  // Último mensaje de cada chat (vista previa estilo WhatsApp). Traemos los
  // mensajes más recientes de cada tabla y nos quedamos con el primero (el más
  // nuevo) de cada chat. Cubre de sobra los chats activos; si alguno muy viejo
  // no entra en la ventana, simplemente se queda sin preview.
  type MsgFila = { chat_id: number; role: string; content: string | null; media_type: string | null };
  const previewDe = (msgs: MsgFila[] | null) => {
    const m = new Map<number, { texto: string; rol: string }>();
    for (const x of msgs ?? []) {
      if (m.has(x.chat_id)) continue; // ya tenemos el más nuevo (vienen desc)
      const media = x.media_type ? (x.media_type === "photo" ? "📷 Foto" : "🎬 Vídeo") : "";
      const texto = (x.content || media || "").replace(/\s+/g, " ").trim().slice(0, 70);
      m.set(x.chat_id, { texto, rol: x.role });
    }
    return m;
  };
  const [msgsAs, msgsJeffer] = await Promise.all([
    supabaseAdmin
      .from("telegram_messages")
      .select("chat_id, role, content, media_type")
      .order("created_at", { ascending: false })
      .limit(600),
    supabaseAdmin
      .from("bot_messages")
      .select("chat_id, role, content, media_type")
      .eq("bot", "jeffer")
      .order("created_at", { ascending: false })
      .limit(600),
  ]);
  const prevAs = previewDe(msgsAs.data as MsgFila[] | null);
  const prevJeffer = previewDe(msgsJeffer.data as MsgFila[] | null);

  type Fila = {
    chat_id: number;
    first_name: string | null;
    username: string | null;
    last_msg_at: string | null;
    opted_out: boolean;
    silenced: boolean;
  };
  const marcar = (
    filas: Fila[] | null,
    origen: "as" | "jeffer",
    botNombre: string,
    prev: Map<number, { texto: string; rol: string }>
  ) =>
    (filas ?? []).map((f) => ({
      ...f,
      origen,
      bot_nombre: botNombre,
      ultimo: prev.get(f.chat_id)?.texto ?? null,
      ultimo_rol: prev.get(f.chat_id)?.rol ?? null,
    }));

  const jugadores = [
    ...marcar(sandro.data as Fila[] | null, "as", "Sandro", prevAs),
    ...marcar(jeffer.data as Fila[] | null, "jeffer", "Jeffer", prevJeffer),
  ].sort((a, b) => (b.last_msg_at ?? "").localeCompare(a.last_msg_at ?? ""));

  return NextResponse.json({ jugadores });
}

export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const chatId = Number(body?.chat_id);
  const silenced = !!body?.silenced;
  if (!chatId) {
    return NextResponse.json({ error: "Falta chat_id." }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("telegram_contacts")
    .update({ silenced })
    .eq("chat_id", chatId);
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}
