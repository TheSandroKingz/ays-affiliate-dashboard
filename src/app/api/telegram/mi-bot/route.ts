import { contadorDeDepositos } from "@/lib/postback";
import { traerTodo } from "@/lib/traerTodo";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApprovedUser } from "@/lib/userAuth";
import { botPorTracking } from "@/lib/bots";

// Depósitos que trae el BOT del afiliado que ha iniciado sesión (Jeffer, Mariam).
// Cada afiliado ve SOLO lo de su bot (se filtra por el afp del bot, p. ej.
// "botjeffer"). Muestra: FTDs, QFTD (cualificados) y lo que ha ganado, más las
// recargas. Si el afiliado no tiene bot asignado, devuelve { tieneBot: false }.
export async function GET(request: Request) {
  const user = await getApprovedUser(request);
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: aff } = await supabaseAdmin
    .from("affiliates")
    .select("freshaffs_tracking_code")
    .eq("user_id", user.id)
    .maybeSingle();
  const bot = botPorTracking(aff?.freshaffs_tracking_code);
  if (!bot) return NextResponse.json({ tieneBot: false });

  // Eventos de postback marcados con el afp EXACTO de ESTE bot (igual que el
  // panel admin; un prefijo podría cruzar datos con otro bot cuyo afp empiece igual).
  const eventos = await traerTodo<{ event_type: string; commission: number | null; amount: number | null; counted: boolean | null; isocountry: string | null; created_at: string; player_id: string | null }>((d, h) =>
  supabaseAdmin
    .from("postback_events")
    .select("event_type, commission, amount, counted, isocountry, created_at, player_id")
    .eq("afp", bot.afp)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(d, h),
)

  const ev = eventos ?? [];
  // Va en orden ascendente por id para que el contador de depósitos vea los
  // acumulados en el orden correcto.
  const evOrden = [...ev].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const nuevoDeposito = contadorDeDepositos();
  let qftd = 0; // depósitos cualificados (los que pagan)
  let ganado = 0; // € ganados (CPA acreditado)
  let ftd = 0; // primeros depósitos (aunque no cualifiquen aún)
  let recargas = 0; // re-depósitos
  let dineroRecargas = 0; // importe de recargas (si FreshBet lo manda)
  for (const e of evOrden) {
    if (e.event_type === "commission" && e.counted) {
      qftd++;
      ganado += Number(e.commission ?? 0);
    } else if (e.event_type === "ftd") {
      ftd++;
    } else if (e.event_type === "redeposit") {
      // ⚠️ Dos trampas de Celsius juntas: manda un `redeposit` también en el
      // PRIMER depósito (así que contarlos todos infla las recargas), y el
      // `amount` es el ACUMULADO del jugador, no lo que acaba de meter (sumarlo
      // en crudo daba 9.961 EUR donde había 2.574).
      if (nuevoDeposito.yaTenia(e.player_id as string | null)) recargas++;
      dineroRecargas += nuevoDeposito(e.player_id as string | null, e.amount);
    }
  }

  // Últimos depósitos cualificados (para verlos uno a uno).
  const recientes = ev
    .filter((e) => e.event_type === "commission" && e.counted)
    .slice(0, 20)
    .map((e) => ({
      fecha: e.created_at as string,
      pais: (e.isocountry as string) || null,
      ganado: Number(e.commission ?? 0),
    }));

  // Enlace directo para ABRIR el bot en el móvil (abre la app de Telegram).
  const botUsername = bot.username; // p. ej. "@iAfriikaBot"
  const botLink = "https://t.me/" + botUsername.replace(/^@/, "");

  return NextResponse.json({
    tieneBot: true,
    bot: bot.label,
    botUsername,
    botLink,
    ftd,
    qftd,
    ganado,
    recargas,
    dineroRecargas,
    recientes,
  });
}
