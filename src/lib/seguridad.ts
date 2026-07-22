import { supabaseAdmin } from "./supabaseAdmin";
import { ADMIN_USER_ID, esCuentaPropia } from "./adminId";

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

// Salud de la conexión con FreshBet. Todo depende de que FreshBet nos mande los
// postbacks; si dejara de hacerlo, perderíamos FTDs sin enterarnos. Como los
// CLICS los contamos NOSOTROS (en /go, independiente de FreshBet), podemos
// distinguir "está roto" (hay clics pero FreshBet no manda nada) de "no hay
// tráfico" (nadie entra → normal que no llegue nada).
//   - ultimoEvento : fecha del último postback recibido (null si nunca)
//   - diasSin      : días desde ese último evento (999 si nunca)
//   - clics7       : clics de los últimos 7 días (tráfico real)
//   - alerta       : true si es sospechoso (7+ días de silencio CON tráfico)
export type SaludFreshbet = {
  ultimoEvento: string | null;
  diasSin: number;
  clics7: number;
  alerta: boolean;
};

export async function saludFreshbet(): Promise<SaludFreshbet> {
  const vacio: SaludFreshbet = {
    ultimoEvento: null,
    diasSin: 999,
    clics7: 0,
    alerta: false,
  };
  try {
    const hace7 = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .slice(0, 10);

    const [ultRes, clicksRes] = await Promise.all([
      supabaseAdmin
        .from("postback_events")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("affiliate_daily_stats")
        .select("clicks")
        .gte("date", hace7),
    ]);

    const ultimoEvento = (ultRes.data?.created_at as string | undefined) ?? null;
    const diasSin = ultimoEvento
      ? Math.floor((Date.now() - new Date(ultimoEvento).getTime()) / 86400000)
      : 999;
    const clics7 = (clicksRes.data ?? []).reduce(
      (s, r) => s + Number(r.clicks ?? 0),
      0
    );

    // Sospechoso: una semana entera sin NINGÚN evento de FreshBet pese a que SÍ
    // hubo tráfico (al menos 5 clics). Sin tráfico no alertamos (sería normal).
    const alerta = diasSin >= 7 && clics7 >= 5;

    return { ultimoEvento, diasSin, clics7, alerta };
  } catch {
    return vacio;
  }
}

// Detección de fraude/autodepósito. FreshBet NO nos da la IP del depositante,
// así que usamos dos señales honestas con lo que YA tenemos:
//   - conversionAnomala : afiliados con demasiados FTD para tan pocos clics
//     (patrón típico de farmear CPA autodepositándose). Excluye cuentas propias
//     (Mongolitos es tráfico directo SIN clics en /go → daría falso positivo) y
//     al admin.
//   - jugadoresCompartidos : un mismo player_id atribuido a MÁS de un afiliado
//     (multicuenta / colusión). El candado ya evita el doble pago, pero esto lo
//     saca a la luz para que lo revises.
// Blindado: ante cualquier fallo devuelve vacío (no asusta con falsos positivos).
export type Fraude = {
  conversionAnomala: {
    user_id: string;
    nombre: string | null;
    ftd: number;
    clicks: number;
    pct: number | null;
  }[];
  jugadoresCompartidos: { player_id: string; afiliados: string[] }[];
  hayAlerta: boolean;
};

export async function deteccionFraude(): Promise<Fraude> {
  const vacio: Fraude = {
    conversionAnomala: [],
    jugadoresCompartidos: [],
    hayAlerta: false,
  };
  try {
    const inicioMes =
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" })
        .format(new Date())
        .slice(0, 7) + "-01";

    const [evRes, dailyRes, affRes] = await Promise.all([
      supabaseAdmin
        .from("postback_events")
        .select("player_id, matched_user_id")
        .in("event_type", ["ftd", "commission"])
        .not("player_id", "is", null)
        .not("matched_user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabaseAdmin
        .from("affiliate_daily_stats")
        .select("user_id, clicks, ftd")
        .gte("date", inicioMes),
      supabaseAdmin.from("affiliates").select("user_id, display_name"),
    ]);

    const nombres = new Map<string, string | null>();
    for (const a of affRes.data ?? []) nombres.set(a.user_id, a.display_name);

    // Mismo jugador en varios afiliados (colusión / multicuenta).
    const porJugador = new Map<string, Set<string>>();
    for (const e of evRes.data ?? []) {
      const p = e.player_id as string | null;
      const u = e.matched_user_id as string | null;
      if (!p || !u || p.startsWith("legacy:")) continue;
      let set = porJugador.get(p);
      if (!set) porJugador.set(p, (set = new Set()));
      set.add(u);
    }
    const jugadoresCompartidos = [...porJugador.entries()]
      .filter(([, set]) => set.size > 1)
      .map(([player_id, set]) => ({
        player_id,
        afiliados: [...set].map((id) => nombres.get(id) ?? id),
      }));

    // Conversión anómala este mes por afiliado (muchos FTD, pocos clics).
    const agg = new Map<string, { clicks: number; ftd: number }>();
    for (const d of dailyRes.data ?? []) {
      const acc = agg.get(d.user_id) ?? { clicks: 0, ftd: 0 };
      acc.clicks += Number(d.clicks ?? 0);
      acc.ftd += Number(d.ftd ?? 0);
      agg.set(d.user_id, acc);
    }
    const conversionAnomala = [...agg.entries()]
      .filter(([uid, v]) => {
        if (uid === ADMIN_USER_ID || esCuentaPropia(uid)) return false;
        if (v.ftd < 3) return false;
        // (a) FTD SIN ningún clic registrado: sus depósitos no vienen de su
        //     enlace /go → patrón de autodepósito más claro. (b) Conversión
        //     clic→FTD altísima (≥50%; el tráfico real convierte mucho menos).
        //     Umbral alto (50%) para no dar falsas alarmas con afiliados
        //     pequeños de confianza (Mariam/Jeffer) que comparten en grupos.
        return v.clicks === 0 || v.ftd / v.clicks >= 0.5;
      })
      .map(([uid, v]) => ({
        user_id: uid,
        nombre: nombres.get(uid) ?? null,
        ftd: v.ftd,
        clicks: v.clicks,
        pct: v.clicks > 0 ? (v.ftd / v.clicks) * 100 : null,
      }));

    return {
      conversionAnomala,
      jugadoresCompartidos,
      hayAlerta:
        conversionAnomala.length > 0 || jugadoresCompartidos.length > 0,
    };
  } catch {
    return vacio;
  }
}

export async function resumenSeguridad(): Promise<ResumenSeguridad> {
  try {
    // FTD antiguos + QFTD nuevos (los QFTD se registran como "commission").
    const { data, error } = await supabaseAdmin
      .from("postback_events")
      .select("status, counted, player_id")
      .in("event_type", ["ftd", "commission"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) return { retenidos: 0, dobles: 0, ok: true };

    const retenidos = data.filter((r) => r.status === "held").length;

    // Solo contamos como "doble" los FTD contados AUTOMÁTICAMENTE (status
    // "counted"). Los aprobados a mano por el admin quedan como "resolved" y no
    // cuentan (si no, cada aprobación de un retenido daría falsa alarma).
    const cnt = new Map<string, number>();
    for (const r of data) {
      if (r.status === "counted" && r.player_id) {
        cnt.set(r.player_id, (cnt.get(r.player_id) ?? 0) + 1);
      }
    }
    const dobles = [...cnt.values()].filter((n) => n > 1).length;

    return { retenidos, dobles, ok: retenidos === 0 && dobles === 0 };
  } catch {
    return { retenidos: 0, dobles: 0, ok: true };
  }
}
