-- ===========================================================================
-- ARREGLOS DE DINERO (auditoría 2026-08-20)
-- Correr ENTERO en el SQL Editor de Supabase. Es idempotente (se puede repetir).
-- Después de correrlo, avísame y empujo los cambios de código que lo usan.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- BUG #1 — Reversión de QFTD atómica (todo-o-nada)
-- ---------------------------------------------------------------------------
-- Cuando el casino quita una comisión (chargeback) de un QFTD de un mes ya
-- cerrado, hay que hacer DOS cosas: restar 1 al FTD (en su mes real) y restar el
-- dinero (en el mes vigente). Antes eran dos llamadas sueltas: si la segunda
-- fallaba, quedaba el FTD restado y el dinero SIN restar, sin reintento.
-- Esta función hace las dos dentro de UNA transacción: si algo falla, no se
-- aplica NADA (y el postback se reintenta limpio).
create or replace function public.reverse_qftd(
  p_user_id    uuid,
  p_ftd_date   date,
  p_money_date date,
  p_commission numeric
) returns void
language plpgsql
as $$
begin
  -- FTD -1 en el mes REAL del QFTD (para que el recuento mensual cuadre).
  perform public.increment_daily_stats(p_user_id, p_ftd_date, 0, 0, -1, 0);
  -- Clawback del dinero en el mes indicado (el vigente si el QFTD es de un mes
  -- ya cerrado; el mismo mes si es del mes en curso).
  perform public.increment_daily_stats(p_user_id, p_money_date, 0, 0, 0, -p_commission);
end;
$$;

-- ---------------------------------------------------------------------------
-- BUG #2 — Reversión en el MES CORRECTO
-- ---------------------------------------------------------------------------
-- Un FTD aprobado a mano cuenta en la fecha de APROBACIÓN, no en la de entrada.
-- Guardamos la fecha en que el evento se contó de verdad, para restarlo en el
-- mes correcto al revertirlo (antes se usaba created_at y descuadraba los meses).
alter table public.postback_events
  add column if not exists counted_date date;

-- Rellena counted_date de los eventos YA contados que no la tengan (aprox: usa la
-- fecha de creación en zona Madrid; sirve para el histórico, los nuevos la fijan
-- exacta desde el código).
update public.postback_events
   set counted_date = (created_at at time zone 'Europe/Madrid')::date
 where counted = true
   and counted_date is null;

-- ---------------------------------------------------------------------------
-- BUG #3 — Red de seguridad anti doble-pago a nivel de BASE DE DATOS
-- ---------------------------------------------------------------------------
-- DIAGNÓSTICO (corre esto PRIMERO y por separado): si devuelve alguna fila, hay
-- jugadores con más de un evento contado (posible doble pago histórico). Mándame
-- el resultado ANTES de crear el índice de abajo.
--
--   select player_id, count(*)
--     from public.postback_events
--    where counted = true
--      and event_type in ('ftd','commission')
--      and player_id is not null
--    group by player_id
--   having count(*) > 1;
--
-- Si el diagnóstico sale VACÍO, crea el índice único: la BD rechazará un segundo
-- evento contado del mismo jugador aunque el candado fallara-abierto.
create unique index if not exists uniq_counted_qftd_per_player
  on public.postback_events (player_id)
  where counted = true and event_type in ('ftd','commission') and player_id is not null;
