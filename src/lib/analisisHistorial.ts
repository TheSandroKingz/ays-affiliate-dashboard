// APRENDIZAJE SUPERVISADO DESDE EL HISTORIAL — Fase 1 (clasificación técnica).
// Backend APARTE del bot: lee conversaciones CERRADAS, las clasifica con la API de
// Claude (batch, separado del bot que habla) y genera informes para revisión HUMANA.
// ⛔ NO ajusta el bot solo. NO mide "éxito" por depósito. NO analiza qué frases hacen
// depositar. Solo calidad técnica y supervisión. BLINDADO: cualquier fallo se ignora.
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabaseAdmin";

const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODELO = "claude-sonnet-4-6";

// Una conversación se considera CERRADA si su último mensaje es de hace más de esto
// (ventana de "cierre de conversación"). Y se analiza si es de los últimos DIAS_VENTANA.
const CIERRE_MS = 2 * 3600 * 1000; // 2 h sin actividad = cerrada
const DIAS_VENTANA = 3;

type Msg = { role: string; content: string | null; created_at: string };
type Conv = { bot: string; chat_id: number; ultimo_msg: string; msgs: Msg[] };

// Fuentes: 'as' = bot de Sandro (telegram_messages); resto = bot_messages por bot.
const BOTS_NUEVOS = ["jeffer", "mariam", "blackkp", "afrika"];

// Reconstruye las conversaciones (cerradas y recientes) de una fuente, agrupando por chat.
async function traerConversaciones(bot: string): Promise<Conv[]> {
  const desde = new Date(Date.now() - DIAS_VENTANA * 864e5).toISOString();
  const q =
    bot === "as"
      ? supabaseAdmin
          .from("telegram_messages")
          .select("chat_id, role, content, created_at")
          .gte("created_at", desde)
      : supabaseAdmin
          .from("bot_messages")
          .select("chat_id, role, content, created_at")
          .eq("bot", bot)
          .gte("created_at", desde);
  const { data } = await q.order("created_at", { ascending: true }).limit(100000);
  const porChat = new Map<number, Msg[]>();
  for (const m of (data ?? []) as (Msg & { chat_id: number })[]) {
    const arr = porChat.get(m.chat_id) ?? [];
    arr.push({ role: m.role, content: m.content, created_at: m.created_at });
    porChat.set(m.chat_id, arr);
  }
  const ahora = Date.now();
  const out: Conv[] = [];
  for (const [chat_id, msgs] of porChat) {
    const ultimo = msgs[msgs.length - 1]?.created_at;
    if (!ultimo) continue;
    if (ahora - new Date(ultimo).getTime() < CIERRE_MS) continue; // aún abierta
    if (msgs.length < 2) continue; // sin intercambio real
    out.push({ bot, chat_id, ultimo_msg: ultimo, msgs });
  }
  return out;
}

const SISTEMA_CLASIF = `Eres un CLASIFICADOR de calidad de soporte. Recibes una conversación entre un bot de atención y un jugador (de un casino). Tu ÚNICO trabajo es ETIQUETARLA de forma OBJETIVA para una revisión humana de calidad TÉCNICA. NO juzgas, NO persuades, NO analizas cómo hacer que alguien deposite ni si depositó. Devuelve SOLO un JSON válido con estos campos:
{
 "tipo_duda": "deposito|retiro|bono|acceso|juego|patron|pago|social|otro",
 "problema_tecnico": true|false,
 "resuelto": "resuelto|no_resuelto|sin_determinar|null",
 "derivado_soporte": true|false,
 "categoria": "no_registrado|registrado|recurrente",
 "friccion_abandono": true|false,
 "resumen": "una frase objetiva de qué pasó"
}
Criterios:
- problema_tecnico: si el jugador reportó un fallo técnico/operativo (no le deja depositar, error de pago, no encuentra algo, retiro atascado...).
- resuelto: SOLO si hubo problema_tecnico. "resuelto" si el jugador confirma que se solucionó ("ya funcionó", "ya pude", "gracias ya está"). "no_resuelto" si sigue el problema ("sigue igual", "no me deja", repite la misma queja). "sin_determinar" si no vuelve a escribir o responde algo ambiguo ("vale", "ok"). Si NO hubo problema técnico, devuelve null.
- derivado_soporte: true si el bot mandó al jugador al soporte/chat en vivo de Celsius.
- categoria: "no_registrado" si no parece tener cuenta; "registrado" si ya depositó/juega; "recurrente" si se ve que lleva tiempo/varias sesiones. Estima por el contexto.
- friccion_abandono: true SOLO si el jugador mostró intención clara de depositar (preguntó métodos/importes/pasos) y la conversación se CORTÓ tras una duda TÉCNICA sin resolver.
- resumen: objetivo y breve, en español, sin opinar.
Responde ÚNICAMENTE el JSON, nada más.`;

type Clasif = {
  tipo_duda: string;
  problema_tecnico: boolean;
  resuelto: string | null;
  derivado_soporte: boolean;
  categoria: string;
  friccion_abandono: boolean;
  resumen: string;
};

async function clasificar(client: Anthropic, conv: Conv): Promise<Clasif | null> {
  const texto = conv.msgs
    .slice(-40) // últimos 40 mensajes, suficiente para clasificar
    .map((m) => `${m.role === "user" ? "JUGADOR" : "BOT"}: ${(m.content || "[media]").slice(0, 400)}`)
    .join("\n");
  try {
    const res = await client.messages.create({
      model: MODELO,
      max_tokens: 400,
      system: SISTEMA_CLASIF,
      messages: [{ role: "user", content: `CONVERSACIÓN:\n${texto}` }],
    });
    const t = res.content.find((b) => b.type === "text");
    const raw = t && "text" in t ? t.text : "";
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const c = JSON.parse(json) as Clasif;
    return c;
  } catch {
    return null;
  }
}

// Clasifica un LOTE de conversaciones cerradas aún sin clasificar. Limitado por el
// tiempo de la función; se llama a diario y va vaciando el backlog. Devuelve cuántas.
export async function analizarLote(limite = 12): Promise<number> {
  if (!KEY) return 0;
  const client = new Anthropic({ apiKey: KEY });
  let hechas = 0;
  for (const bot of ["as", ...BOTS_NUEVOS]) {
    if (hechas >= limite) break;
    let convs: Conv[] = [];
    try {
      convs = await traerConversaciones(bot);
    } catch {
      continue;
    }
    for (const conv of convs) {
      if (hechas >= limite) break;
      // ¿Ya clasificada en este estado? (misma última fecha) → saltar.
      const { data: yaData } = await supabaseAdmin
        .from("analisis_conversaciones")
        .select("id")
        .eq("bot", conv.bot)
        .eq("chat_id", conv.chat_id)
        .eq("ultimo_msg", conv.ultimo_msg)
        .limit(1);
      if (yaData && yaData.length) continue;
      const c = await clasificar(client, conv);
      if (!c) continue;
      await supabaseAdmin.from("analisis_conversaciones").insert({
        bot: conv.bot,
        chat_id: conv.chat_id,
        ultimo_msg: conv.ultimo_msg,
        tipo_duda: c.tipo_duda ?? null,
        problema_tecnico: !!c.problema_tecnico,
        resuelto: c.resuelto === "null" ? null : c.resuelto ?? null,
        derivado_soporte: !!c.derivado_soporte,
        categoria: c.categoria ?? null,
        friccion_abandono: !!c.friccion_abandono,
        resumen: (c.resumen ?? "").slice(0, 500),
      });
      hechas++;
    }
  }
  await supabaseAdmin
    .from("analisis_config")
    .update({ ultimo_run: new Date().toISOString() })
    .eq("id", 1);
  return hechas;
}

// Genera el INFORME agregado del periodo (últimos 3 días) a partir de lo clasificado.
export async function generarInforme(): Promise<{ id: number } | null> {
  try {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - DIAS_VENTANA * 864e5);
    const { data } = await supabaseAdmin
      .from("analisis_conversaciones")
      .select("bot, chat_id, tipo_duda, problema_tecnico, resuelto, derivado_soporte, categoria, friccion_abandono, resumen")
      .gte("created_at", desde.toISOString())
      .limit(100000);
    const filas = data ?? [];
    const total = filas.length;
    const conProblema = filas.filter((f) => f.problema_tecnico);
    const resueltos = conProblema.filter((f) => f.resuelto === "resuelto").length;
    const noResueltos = conProblema.filter((f) => f.resuelto === "no_resuelto").length;
    const sinDeterminar = conProblema.filter((f) => f.resuelto === "sin_determinar").length;
    const cuenta = (campo: keyof (typeof filas)[number]) => {
      const m: Record<string, number> = {};
      for (const f of filas) {
        const k = (f[campo] as string) || "otro";
        m[k] = (m[k] ?? 0) + 1;
      }
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const datos = {
      total,
      problemas_tecnicos: conProblema.length,
      tasa_resolucion:
        conProblema.length > 0 ? Math.round((resueltos / conProblema.length) * 100) : null,
      resueltos,
      no_resueltos: noResueltos,
      sin_determinar: sinDeterminar,
      derivaciones_soporte: filas.filter((f) => f.derivado_soporte).length,
      fricciones_abandono: filas.filter((f) => f.friccion_abandono).length,
      por_tipo_duda: cuenta("tipo_duda"),
      por_bot: cuenta("bot"),
      // Ejemplos concretos (no resueltos + fricciones) para que Yaiza los revise.
      ejemplos_no_resueltos: conProblema
        .filter((f) => f.resuelto === "no_resuelto")
        .slice(0, 15)
        .map((f) => ({ bot: f.bot, chat_id: f.chat_id, tipo: f.tipo_duda, resumen: f.resumen })),
      ejemplos_friccion: filas
        .filter((f) => f.friccion_abandono)
        .slice(0, 15)
        .map((f) => ({ bot: f.bot, chat_id: f.chat_id, tipo: f.tipo_duda, resumen: f.resumen })),
    };
    const { data: ins } = await supabaseAdmin
      .from("analisis_informes")
      .insert({ desde: desde.toISOString(), hasta: hasta.toISOString(), datos })
      .select("id")
      .single();
    await supabaseAdmin
      .from("analisis_config")
      .update({ ultimo_informe: hasta.toISOString() })
      .eq("id", 1);
    return ins ? { id: ins.id as number } : null;
  } catch {
    return null;
  }
}

// ¿Toca generar informe? (han pasado >= 3 días desde el último). Para engancharlo al
// cron diario (Vercel plan gratis = 1 cron/día), como el vigilante de caídas.
export async function tocaInforme(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("analisis_config")
      .select("ultimo_informe")
      .eq("id", 1)
      .maybeSingle();
    const ultimo = data?.ultimo_informe ? new Date(data.ultimo_informe).getTime() : 0;
    return Date.now() - ultimo >= DIAS_VENTANA * 864e5;
  } catch {
    return false;
  }
}
