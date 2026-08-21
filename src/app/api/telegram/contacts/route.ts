import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUser, getGestorBot } from "@/lib/adminAuth";

// Bots con tablas propias (bot_*) que se muestran en el panel, con su etiqueta.
// El bot de Sandro va aparte (telegram_*, origen "as"). Mariam = persona Livana.
const BOTS_EXTRA = [
  { key: "jeffer", nombre: "Jeffer" },
  { key: "mariam", nombre: "Livana" },
  { key: "blackkp", nombre: "Black KP" },
];

type Fila = {
  chat_id: number;
  first_name: string | null;
  username: string | null;
  last_msg_at: string | null;
  opted_out: boolean;
  silenced: boolean;
};
type MsgFila = { chat_id: number; role: string; content: string | null; media_type: string | null };

// GET: lista de jugadores (para el panel). Lo pueden LEER el admin y los gestores
// del bot (Yaiza). Junta los chats del bot de Sandro (telegram_contacts, origen
// "as") con los de los bots nuevos (bot_contacts: Jeffer y Livana/Mariam), cada
// uno etiquetado para saber de qué bot es. POST: silenciar — solo admin.
export async function GET(request: Request) {
  const user = await getGestorBot(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Contactos: Sandro (telegram_contacts) + cada bot nuevo (bot_contacts).
  const contactos = await Promise.all([
    supabaseAdmin
      .from("telegram_contacts")
      .select("chat_id, first_name, username, last_msg_at, opted_out, silenced")
      .order("last_msg_at", { ascending: false, nullsFirst: false })
      .limit(150),
    ...BOTS_EXTRA.map((b) =>
      supabaseAdmin
        .from("bot_contacts")
        .select("chat_id, first_name, username, last_msg_at, opted_out, silenced")
        .eq("bot", b.key)
        .order("last_msg_at", { ascending: false, nullsFirst: false })
        .limit(150)
    ),
  ]);

  // Último mensaje de cada chat (vista previa estilo WhatsApp): traemos los más
  // recientes de cada tabla y nos quedamos con el primero (el más nuevo) por chat.
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
  // Los chat_id que realmente vamos a mostrar (para acotar las previews a ELLOS
  // y que ningún contacto listado salga sin vista previa por quedar fuera de una
  // ventana global de mensajes).
  const idsSandro = ((contactos[0].data as Fila[] | null) ?? []).map((f) => f.chat_id);
  const idsBots = BOTS_EXTRA.map(
    (_, i) => ((contactos[i + 1].data as Fila[] | null) ?? []).map((f) => f.chat_id)
  );
  const previews = await Promise.all([
    idsSandro.length
      ? supabaseAdmin
          .from("telegram_messages")
          .select("chat_id, role, content, media_type")
          .in("chat_id", idsSandro)
          .order("created_at", { ascending: false })
          .limit(4000)
      : Promise.resolve({ data: [] as MsgFila[] }),
    ...BOTS_EXTRA.map((b, i) =>
      idsBots[i].length
        ? supabaseAdmin
            .from("bot_messages")
            .select("chat_id, role, content, media_type")
            .eq("bot", b.key)
            .in("chat_id", idsBots[i])
            .order("created_at", { ascending: false })
            .limit(4000)
        : Promise.resolve({ data: [] as MsgFila[] })
    ),
  ]);

  const marcar = (
    filas: Fila[] | null,
    origen: string,
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
    ...marcar(
      contactos[0].data as Fila[] | null,
      "as",
      "Sandro",
      previewDe(previews[0].data as MsgFila[] | null)
    ),
    ...BOTS_EXTRA.flatMap((b, i) =>
      marcar(
        contactos[i + 1].data as Fila[] | null,
        b.key,
        b.nombre,
        previewDe(previews[i + 1].data as MsgFila[] | null)
      )
    ),
  ].sort((a, b) => (b.last_msg_at ?? "").localeCompare(a.last_msg_at ?? ""));

  return NextResponse.json({ jugadores });
}

export async function POST(request: Request) {
  const user = await getAdminUser(request);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const chatId = Number(body?.chat_id);
  const silenced = !!body?.silenced;
  const origen = body?.origen === "jeffer" || body?.origen === "mariam" || body?.origen === "blackkp" ? body.origen : "as";
  if (!chatId) {
    return NextResponse.json({ error: "Falta chat_id." }, { status: 400 });
  }
  // El bot de Sandro guarda en telegram_contacts; los bots nuevos (Jeffer,
  // Mariam/Livana) en bot_contacts con su columna `bot`.
  const q =
    origen === "as"
      ? supabaseAdmin.from("telegram_contacts").update({ silenced }).eq("chat_id", chatId)
      : supabaseAdmin
          .from("bot_contacts")
          .update({ silenced })
          .eq("bot", origen)
          .eq("chat_id", chatId);
  const { error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}
