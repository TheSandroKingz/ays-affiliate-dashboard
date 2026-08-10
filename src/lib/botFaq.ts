import { supabaseAdmin } from "@/lib/supabaseAdmin";

// FAQ aprendida (aprobada por el dueño en /admin/aprender). El bot la mete en su
// prompt para responder mejor a lo que la gente pregunta de verdad. Cacheada 60s
// en memoria para no leer la BD en cada mensaje. BLINDADO: ante cualquier fallo
// (incluida tabla aún sin crear) devuelve lo último cacheado, o vacío.
let faqCache: { v: string; exp: number } | null = null;

export async function getFaqTexto(): Promise<string> {
  const now = Date.now();
  if (faqCache && faqCache.exp > now) return faqCache.v;
  try {
    const { data } = await supabaseAdmin
      .from("bot_faq")
      .select("tema, respuesta")
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(200);
    const lineas = (data ?? [])
      .map((f) => {
        const tema = String(f.tema ?? "").trim();
        const resp = String(f.respuesta ?? "").trim();
        if (!resp) return "";
        return tema ? `- ${tema}: ${resp}` : `- ${resp}`;
      })
      .filter(Boolean);
    const v = lineas.join("\n");
    faqCache = { v, exp: now + 60_000 };
    return v;
  } catch {
    return faqCache?.v ?? "";
  }
}

// Bloque para añadir al system prompt (vacío si no hay FAQ). Se marca como
// respuestas aprobadas por ti para que el bot las priorice, sin inventarse nada.
export function faqSuffix(faq: string): string {
  if (!faq) return "";
  return `\n\nRESPUESTAS APROBADAS (tú, el dueño, las has validado; úsalas cuando venga a cuento, con tu tono, sin inventar nada fuera de aquí):\n${faq}`;
}
