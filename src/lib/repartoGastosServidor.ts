import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validarMiembros, type Miembro } from "@/lib/repartoGastos";

// Leer y guardar el reparto de gastos de un equipo (ver repartoGastos.ts).
// Blindado: si la tabla aún no existe, se trabaja sin reparto.
const tablaFalta = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /reparto_gastos_afiliados/.test(e.message ?? ""));

export async function leerReparto(userId: string): Promise<{ miembros: Miembro[]; tablaFalta: boolean }> {
  const { data, error } = await supabaseAdmin.from("reparto_gastos_afiliados").select("miembros").eq("user_id", userId).maybeSingle();
  if (tablaFalta(error)) return { miembros: [], tablaFalta: true };
  const v = validarMiembros(data?.miembros ?? []);
  return { miembros: "miembros" in v ? v.miembros : [], tablaFalta: false };
}

// Lista vacía = trabaja solo (se borra el reparto).
export async function guardarReparto(userId: string, entrada: unknown): Promise<{ ok: true; miembros: Miembro[] } | { error: string; status: number }> {
  const v = validarMiembros(entrada);
  if ("error" in v) return { error: v.error, status: 400 };
  const { error } = v.miembros.length
    ? await supabaseAdmin.from("reparto_gastos_afiliados").upsert({ user_id: userId, miembros: v.miembros, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    : await supabaseAdmin.from("reparto_gastos_afiliados").delete().eq("user_id", userId);
  if (tablaFalta(error)) return { error: "El reparto aún no está activado.", status: 503 };
  if (error) return { error: "No se pudo guardar el reparto.", status: 500 };
  return { ok: true, miembros: v.miembros };
}
