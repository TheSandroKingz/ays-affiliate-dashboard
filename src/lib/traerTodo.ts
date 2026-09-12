// ── PAGINACIÓN: PostgREST corta SIEMPRE a 1000 filas ────────────────────────
// Todo el proyecto pedía `.limit(100000)` creyendo que así se levantaba el tope.
// NO se levanta: el servidor corta a 1000 filas por respuesta pase lo que pase.
// Verificado en producción el 12-sep-2026:
//   telegram_contacts  1.073 filas reales → devolvía 1.000
//   postback_events   13.116 filas reales → devolvía 1.000
// Con .range(0, 99999) pasa exactamente lo mismo.
//
// Consecuencia: los totales de dinero, los recuentos de contactos y hasta las
// copias de seguridad salían calculados sobre un trozo de los datos.
//
// Esto trae la tabla ENTERA pidiéndola en bloques de 1000.
//
// ⚠️ La consulta tiene que ir ORDENADA por algo estable (created_at, id...). Sin
// orden, Postgres puede devolver las filas en distinto orden en cada bloque y
// se perderían o repetirían.
export async function traerTodo<T>(
  consulta: (
    desde: number,
    hasta: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tope = 200_000
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < tope; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error || !data) break;
    filas.push(...(data as T[]));
    if (data.length < 1000) break; // último bloque
  }
  return filas;
}
