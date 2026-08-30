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
 "decepcion_bot": true|false,
 "solucion": null | {"problema": "texto", "solucion": "texto"},
 "resumen": "una frase objetiva de qué pasó"
}
Criterios:
- problema_tecnico: si el jugador reportó un fallo técnico/operativo (no le deja depositar, error de pago, no encuentra algo, retiro atascado...).
- resuelto: SOLO si hubo problema_tecnico. "resuelto" si el jugador confirma que se solucionó ("ya funcionó", "ya pude", "gracias ya está") o continúa el proceso con normalidad sin volver a mencionar el problema. "no_resuelto" si sigue el problema ("sigue igual", "no me deja", repite la misma queja). "sin_determinar" si no vuelve a escribir o responde algo ambiguo ("vale", "ok"). Si NO hubo problema técnico, devuelve null.
- derivado_soporte: true si el bot mandó al jugador al soporte/chat en vivo de Celsius.
- categoria: "no_registrado" si no parece tener cuenta; "registrado" si ya depositó/juega; "recurrente" si se ve que lleva tiempo/varias sesiones. Estima por el contexto.
- friccion_abandono: true SOLO si el jugador mostró intención clara de depositar (preguntó métodos/importes/pasos) y la conversación se CORTÓ tras una duda TÉCNICA sin resolver.
- decepcion_bot: true SOLO si el jugador expresó de forma EXPLÍCITA una queja dirigida directamente AL BOT o a su servicio ("menudo bot inútil", "no me sirves para nada", "vaya ayuda de mierda", "paso de esto", quejas de no ser entendido o de respuestas repetitivas). NO cuenta: quejas por perder dinero o por el juego, quejas sobre Celsius como plataforma, sarcasmo/bromas sin queja real, ni el simple silencio. En la duda, false.
- solucion: rellénalo SOLO si problema_tecnico=true Y resuelto="resuelto" Y el bot dio un ARREGLO TÉCNICO/OPERATIVO concreto y REUTILIZABLE que resolvió el problema (ej: "para el error 'can not make a bet', jugar con el dinero real sin activar el bono"; "para Apple Pay que no aparece, cerrar el navegador, quitar el WiFi, poner datos móviles y reintentar"; "para encontrar Diamond Mines, buscarlo con la lupa del inicio"). "problema" = descripción breve y GENÉRICA del problema (para poder emparejarlo con casos futuros parecidos, sin datos personales). "solucion" = los pasos que funcionaron. ⛔ PROHIBIDO poner aquí nada que sea CONVENCER, PRESIONAR o ANIMAR a depositar/recargar/jugar: eso NO es una solución técnica. Si no hay un arreglo técnico claro y confirmado, devuelve null.
- resumen: objetivo y breve, en español, sin opinar.
Responde ÚNICAMENTE el JSON, nada más.`;

type Clasif = {
  tipo_duda: string;
  problema_tecnico: boolean;
  resuelto: string | null;
  derivado_soporte: boolean;
  categoria: string;
  friccion_abandono: boolean;
  decepcion_bot: boolean;
  solucion: { problema: string; solucion: string } | null;
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

  // Claves ya clasificadas (bot + chat + instante del último msg), para no repetir.
  // Comparamos por INSTANTE (getTime) para no fallar por formatos de fecha distintos.
  const claveConv = (bot: string, chat_id: number, ultimo: string) =>
    `${bot}:${chat_id}:${new Date(ultimo).getTime()}`;
  const yaClasificadas = new Set<string>();
  try {
    const { data: prev } = await supabaseAdmin
      .from("analisis_conversaciones")
      .select("bot, chat_id, ultimo_msg")
      .limit(100000);
    for (const r of (prev ?? []) as { bot: string; chat_id: number; ultimo_msg: string }[]) {
      yaClasificadas.add(claveConv(r.bot, r.chat_id, r.ultimo_msg));
    }
  } catch {
    /* si falla, seguimos: el índice único de la tabla evita duplicados igualmente */
  }

  // Una COLA de conversaciones pendientes por bot. Luego repartimos el lote en
  // ROUND-ROBIN entre bots para que NINGÚN bot (p. ej. Sandro, con mucho volumen)
  // se coma todo el cupo y los demás no salgan nunca en el informe.
  const colas: Conv[][] = [];
  for (const bot of ["as", ...BOTS_NUEVOS]) {
    let convs: Conv[] = [];
    try {
      convs = await traerConversaciones(bot);
    } catch {
      continue;
    }
    const pend = convs.filter(
      (c) => !yaClasificadas.has(claveConv(c.bot, c.chat_id, c.ultimo_msg))
    );
    if (pend.length) colas.push(pend);
  }

  let hechas = 0;
  let idx = 0;
  while (hechas < limite && colas.some((c) => c.length)) {
    const cola = colas[idx % colas.length];
    idx++;
    const conv = cola.shift();
    if (!conv) continue; // esta cola ya está vacía, el round-robin sigue con las demás
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
      decepcion_bot: !!c.decepcion_bot,
      resumen: (c.resumen ?? "").slice(0, 500),
    });

    // Banco de soluciones (Adenda 1): si el bot dio un ARREGLO TÉCNICO confirmado,
    // lo guardamos como PENDIENTE de aprobación por Yaiza. Nunca se usa sin aprobar.
    // Guardarraíl: solo problemas técnicos resueltos; nada de persuasión/depósito.
    if (
      c.solucion &&
      c.solucion.problema &&
      c.solucion.solucion &&
      c.problema_tecnico &&
      c.resuelto === "resuelto"
    ) {
      await supabaseAdmin.from("soluciones_verificadas").upsert(
        {
          problema: String(c.solucion.problema).slice(0, 600),
          solucion: String(c.solucion.solucion).slice(0, 1500),
          estado: "pendiente",
          bot: conv.bot,
          origen_bot: conv.bot,
          origen_chat_id: conv.chat_id,
        },
        { onConflict: "origen_bot,origen_chat_id", ignoreDuplicates: true }
      );
    }
    hechas++;
  }
  await supabaseAdmin
    .from("analisis_config")
    .update({ ultimo_run: new Date().toISOString() })
    .eq("id", 1);
  return hechas;
}

// Reordena una lista intercalando por bot (round-robin), para que en el informe NO
// domine un solo bot (p. ej. Sandro): así los primeros casos que se muestran son un
// MIX de todos los bots, no 8 seguidos del mismo.
function mezclarPorBot<T extends { bot: string }>(items: T[]): T[] {
  const grupos = new Map<string, T[]>();
  for (const it of items) {
    const b = it.bot || "otro";
    const arr = grupos.get(b);
    if (arr) arr.push(it);
    else grupos.set(b, [it]);
  }
  const arrs = [...grupos.values()];
  const out: T[] = [];
  let i = 0;
  while (out.length < items.length) {
    let added = false;
    for (const arr of arrs) {
      if (i < arr.length) {
        out.push(arr[i]);
        added = true;
      }
    }
    if (!added) break;
    i++;
  }
  return out;
}

// Similitud simple por solapamiento de palabras (Jaccard), para marcar POSIBLES
// duplicados de soluciones sin depender de embeddings. Suficiente para "¿es el
// mismo problema?" a ojo de un humano que luego decide.
function similares(a: string, b: string): boolean {
  const norm = (s: string) =>
    new Set(
      (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .match(/[a-z0-9]{3,}/g) ?? []
    );
  const A = norm(a);
  const B = norm(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 && inter / union >= 0.5;
}

// Genera el INFORME agregado del periodo (últimos 3 días) a partir de lo clasificado.
export async function generarInforme(): Promise<{ id: number } | null> {
  try {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - DIAS_VENTANA * 864e5);
    const { data } = await supabaseAdmin
      .from("analisis_conversaciones")
      .select("bot, chat_id, tipo_duda, problema_tecnico, resuelto, derivado_soporte, categoria, friccion_abandono, decepcion_bot, resumen")
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

    // --- Banco de soluciones verificadas (Adenda 1) para el informe ---
    const { data: pendData } = await supabaseAdmin
      .from("soluciones_verificadas")
      .select("id, bot, problema, solucion, origen_bot, origen_chat_id")
      .eq("estado", "pendiente")
      .order("fecha_deteccion", { ascending: false })
      .limit(50);
    const { data: aprobData } = await supabaseAdmin
      .from("soluciones_verificadas")
      .select("id, bot, problema, solucion")
      .eq("estado", "aprobada")
      .limit(1000);
    const aprobadas = (aprobData ?? []) as {
      id: number;
      bot: string | null;
      problema: string;
      solucion: string;
    }[];
    // Cada pendiente: marca POSIBLE DUPLICADO si ya hay una aprobada del mismo bot
    // con problema parecido (para que Yaiza las vea juntas y decida).
    const solucionesPendientes = (
      (pendData ?? []) as {
        id: number;
        bot: string | null;
        problema: string;
        solucion: string;
        origen_bot: string | null;
        origen_chat_id: number | null;
      }[]
    ).map((p) => {
      const dup = aprobadas.find(
        (a) => (!a.bot || !p.bot || a.bot === p.bot) && similares(a.problema, p.problema)
      );
      return {
        id: p.id,
        bot: p.bot,
        problema: p.problema,
        solucion: p.solucion,
        origen_bot: p.origen_bot,
        origen_chat_id: p.origen_chat_id,
        dup: dup ? { id: dup.id, problema: dup.problema, solucion: dup.solucion } : null,
      };
    });
    // Reutilizaciones EN EL PERIODO (del log de usos), por solución.
    const { data: usos } = await supabaseAdmin
      .from("soluciones_verificadas_usos")
      .select("solucion_id")
      .gte("created_at", desde.toISOString())
      .lte("created_at", hasta.toISOString())
      .limit(100000);
    const conteoUsos = new Map<number, number>();
    for (const u of (usos ?? []) as { solucion_id: number }[]) {
      conteoUsos.set(u.solucion_id, (conteoUsos.get(u.solucion_id) ?? 0) + 1);
    }
    const aprobById = new Map(aprobadas.map((a) => [a.id, a]));
    const solucionesReutilizadas = [...conteoUsos.entries()]
      .map(([id, veces]) => {
        const a = aprobById.get(id);
        return { id, veces, bot: a?.bot ?? null, problema: a?.problema ?? "(solución)" };
      })
      .sort((x, y) => y.veces - x.veces);

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
      ejemplos_no_resueltos: mezclarPorBot(conProblema.filter((f) => f.resuelto === "no_resuelto"))
        .slice(0, 15)
        .map((f) => ({ bot: f.bot, chat_id: f.chat_id, tipo: f.tipo_duda, resumen: f.resumen })),
      ejemplos_friccion: mezclarPorBot(filas.filter((f) => f.friccion_abandono))
        .slice(0, 15)
        .map((f) => ({ bot: f.bot, chat_id: f.chat_id, tipo: f.tipo_duda, resumen: f.resumen })),
      // Adenda 2: jugadores que se quejaron EXPLÍCITAMENTE del bot (calidad, no bienestar).
      decepciones: filas.filter((f) => f.decepcion_bot).length,
      ejemplos_decepcion: mezclarPorBot(filas.filter((f) => f.decepcion_bot))
        .slice(0, 15)
        .map((f) => ({ bot: f.bot, chat_id: f.chat_id, resumen: f.resumen })),
      // Adenda 1: banco de soluciones — pendientes de aprobar + reutilizadas en el periodo.
      soluciones_pendientes: solucionesPendientes,
      soluciones_reutilizadas: solucionesReutilizadas,
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

// --- Banco de soluciones: uso EN VIVO por los bots (Adenda 1, fase de reutilización) ---

// Bloque de texto con las soluciones APROBADAS de un bot (+ las comunes) para
// inyectarlo en el prompt del bot. Vacío si no hay ninguna aprobada → el bot no
// cambia en nada hasta que Yaiza apruebe soluciones. SOLO arreglos técnicos.
export async function bloqueSolucionesAprobadas(botKey: string): Promise<string> {
  try {
    let q = supabaseAdmin
      .from("soluciones_verificadas")
      .select("id, problema, solucion")
      .eq("estado", "aprobada");
    // Soluciones de ESTE bot + las comunes (bot null). Si no hay bot, solo comunes.
    q = /^[a-z]+$/.test(botKey) ? q.or(`bot.eq.${botKey},bot.is.null`) : q.is("bot", null);
    const { data } = await q.limit(60);
    const rows = (data ?? []) as { id: number; problema: string; solucion: string }[];
    if (!rows.length) return "";
    const lista = rows
      .map((r) => `- [id ${r.id}] Problema: ${r.problema} → Solución: ${r.solucion}`)
      .join("\n");
    return `BANCO DE SOLUCIONES VERIFICADAS (arreglos técnicos ya comprobados y APROBADOS por la revisión humana). Si el problema del jugador COINCIDE claramente con uno de estos, usa DIRECTAMENTE esa solución (con TU voz y naturalidad) en vez de improvisar o gastar intentos a ciegas. Si usas una, empieza tu respuesta EXACTAMENTE con la marca [SOL:<id>] (se quita antes de enviar; el jugador NO la ve). Si ninguna encaja de verdad, resuelve como siempre y NO pongas ninguna marca.\n${lista}`;
  } catch {
    return "";
  }
}

// Registra que un bot REUTILIZÓ una solución aprobada con un jugador (para el
// contador "reutilizadas en el periodo"). Best-effort: nunca rompe la respuesta.
export async function registrarUsoSolucion(
  solId: number,
  botKey: string,
  chatId: number
): Promise<void> {
  try {
    await supabaseAdmin
      .from("soluciones_verificadas_usos")
      .insert({ solucion_id: solId, bot: botKey, chat_id: chatId });
  } catch {
    /* si falla, no pasa nada: el contador es informativo */
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
