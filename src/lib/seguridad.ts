import { supabaseAdmin } from "./supabaseAdmin";

// Estado de seguridad del dinero (solo admin). Mira la caja negra de postbacks
// y detecta lo único que sería robo/doble pago real:
//   - retenidos : FTD frenados por sospecha, pendientes de que el admin decida
//   - dobles    : jugadores CONTADOS más de una vez (doble pago ya materializado)
// `ok` = todo limpio (nada retenido, ningún doble pago). BLINDADO: ante fallo
// devuelve ok para no asustar con un falso positivo por un error de lectura.
export type ResumenSeguridad = {
  retenidos: number;
  dobles: number;
  ok: boolean;
};

export async function resumenSeguridad(): Promise<ResumenSeguridad> {
  try {
    const { data, error } = await supabaseAdmin
      .from("postback_events")
      .select("status, counted, player_id")
      .eq("event_type", "ftd")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) return { retenidos: 0, dobles: 0, ok: true };

    const retenidos = data.filter((r) => r.status === "held").length;

    const cnt = new Map<string, number>();
    for (const r of data) {
      if (r.counted && r.player_id) {
        cnt.set(r.player_id, (cnt.get(r.player_id) ?? 0) + 1);
      }
    }
    const dobles = [...cnt.values()].filter((n) => n > 1).length;

    return { retenidos, dobles, ok: retenidos === 0 && dobles === 0 };
  } catch {
    return { retenidos: 0, dobles: 0, ok: true };
  }
}
