import { traerTodo } from "@/lib/traerTodo";
import { enviarPush } from "@/lib/push";
import { ADMIN_USER_ID } from "@/lib/adminId";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { compararSecreto } from "@/lib/secreto";

// Margen de tiempo: copiar las tablas completas puede tardar; que no se corte.
export const maxDuration = 60;

// Copia de seguridad automática (cron diario): guarda una "foto" de las tablas
// de datos en `data_snapshots`. Permite restaurar si un día se corrompe o se
// borra algo por error. Conserva las últimas 7 copias. Protegido por CRON_SECRET.
// ⚠️ CUÁNTAS COPIAS: cada una pesa ~7,4 MB y el 99% es postback_events (la caja
// negra del dinero), que crece ~366 filas al día. Con 14 copias eran ~104 MB de los
// 500 MB del plan gratis de Supabase, subiendo ~2,5 MB cada día (medido el 17-sep).
// Con 7 se mantiene una semana entera de vuelta atrás ocupando la mitad.
// (No sustituye a una copia EXTERNA; ver scripts/backup.mjs para eso.)
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!compararSecreto(authHeader?.replace("Bearer ", ""), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tablas = [
  "affiliates",
  "affiliate_daily_stats",
  "payments",
  // La caja negra del dinero (la prueba de cada FTD y cada comisión) NO se
  // copiaba, ni los gastos ni las penalizaciones.
  "postback_events",
  "gastos",
  "gastos_saldos",
  "penalizaciones",
];
  // ⚠️ .limit(100000) NO levanta el tope: PostgREST corta a 1000 filas por
  // respuesta pase lo que pase. La copia llevaba meses TRUNCADA sin avisar de
  // nada: el 13-sep guardaba 1.000 filas de postback_events de las 13.445 que
  // hay, o sea el 92% de la caja negra del dinero sin copiar. Hay que paginar.
  const data: Record<string, unknown[]> = {};
  // ⚠️ Paginar exige ORDENAR por algo estable, y NO todas las tablas tienen "id":
  // `penalizaciones` va por "mes" y `gastos_saldos` no tiene id tampoco. Si se
  // ordena por una columna que no existe, la consulta falla y esa tabla saldría
  // VACÍA en la copia, que es peor que truncada. Aquí va la columna de cada una.
  const ORDEN: Record<string, string> = {
    penalizaciones: "mes",
    gastos_saldos: "mes",
  };
  const res = await Promise.all(
    tablas.map((t) =>
      traerTodo<Record<string, unknown>>((d, h) =>
        supabaseAdmin
          .from(t)
          .select("*")
          .order(ORDEN[t] ?? "id", { ascending: true })
          .range(d, h)
      )
    )
  );
  tablas.forEach((t, i) => {
    data[t] = res[i];
  });

  // Si alguna tabla se queda corta respecto a lo que hay de verdad, la copia NO
  // sirve: mejor saberlo que guardar una copia falsa en silencio.
  const incompletas: string[] = [];
  await Promise.all(
    tablas.map(async (t, i) => {
      const { count } = await supabaseAdmin.from(t).select("*", { count: "exact", head: true });
      if (typeof count === "number" && res[i].length < count) {
        incompletas.push(`${t} (${res[i].length}/${count})`);
      }
    })
  );

  const { error } = await supabaseAdmin.from("data_snapshots").insert({ data });
  if (incompletas.length) {
    await enviarPush(ADMIN_USER_ID, {
      title: "⚠️ La copia de seguridad salió incompleta",
      body: `Faltan filas en: ${incompletas.join(", ")}. Revísalo, la copia de hoy no sirve entera.`,
      url: "/admin",
    }).catch(() => {});
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Conservar solo las últimas 7 copias (ver la nota de arriba sobre el tamaño).
  const { data: viejas } = await supabaseAdmin
    .from("data_snapshots")
    .select("id")
    .order("created_at", { ascending: false })
    .range(7, 1000);
  if (viejas && viejas.length) {
    await supabaseAdmin
      .from("data_snapshots")
      .delete()
      .in("id", viejas.map((v) => v.id))
      .then(() => {}, () => {});
  }

  // Limpieza de suscripciones push FANTASMA: endpoints que Apple/Google siguen
  // aceptando (201) pero que ya no entregan a ningún móvil, porque el iPhone
  // rotó el endpoint o se desinstaló la app. Un dispositivo vivo refresca su
  // last_seen_at cada 6 h al abrir la app; si lleva 45 días sin dar señales, es
  // un fantasma y solo sirve para que parezca que el aviso salió cuando no
  // llegó a nadie. Blindado: si la columna aún no existe, no se borra nada.
  const hace45 = new Date(Date.now() - 45 * 864e5).toISOString();
  await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .lt("last_seen_at", hace45)
    .then(
      () => {},
      () => {}
    );

  return NextResponse.json({
    ok: true,
    filas: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v.length])
    ),
  });
}
