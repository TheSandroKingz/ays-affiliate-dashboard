import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validarConfig, type ConfigGastos } from "@/lib/repartoGastos";

// Leer y guardar la configuración de gastos de un afiliado (socios + conceptos con
// su %, ver repartoGastos.ts). Va entera en la columna jsonb `miembros` de
// reparto_gastos_afiliados. Sin fila = aún no la ha configurado.
const tablaFalta = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /reparto_gastos_afiliados/.test(e.message ?? ""));

export async function leerConfig(userId: string): Promise<{ config: ConfigGastos | null; tablaFalta: boolean; error: boolean }> {
  const { data, error } = await supabaseAdmin.from("reparto_gastos_afiliados").select("miembros").eq("user_id", userId).maybeSingle();
  if (tablaFalta(error)) return { config: null, tablaFalta: true, error: false };
  if (error) return { config: null, tablaFalta: false, error: true };
  if (!data) return { config: null, tablaFalta: false, error: false };
  const v = validarConfig(data.miembros);
  return { config: "config" in v ? v.config : null, tablaFalta: false, error: false };
}

export async function guardarConfig(userId: string, entrada: unknown): Promise<{ ok: true; config: ConfigGastos } | { error: string; status: number }> {
  const v = validarConfig(entrada);
  if ("error" in v) return { error: v.error, status: 400 };
  const { error } = await supabaseAdmin
    .from("reparto_gastos_afiliados")
    .upsert({ user_id: userId, miembros: v.config, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (tablaFalta(error)) return { error: "La configuración aún no está activada.", status: 503 };
  if (error) return { error: "No se pudo guardar la configuración.", status: 500 };
  return { ok: true, config: v.config };
}
