-- 🛡️ Blindaje + rendimiento (revisión dashboard/seguridad).
-- Todo aditivo y seguro. El código ya funciona SIN esto (tiene fallback); al
-- aplicarlo, el panel de admin y el cron van más rápidos y se cierra un hueco.

-- ── A2 · Duplicados de QFTD agregados en Postgres ────────────────────────────
-- Antes se bajaba TODO el histórico de player_id y se contaba en memoria en CADA
-- carga del inicio de admin y CADA tick del cron. Este RPC agrega en la BD y
-- devuelve 0 filas en el caso normal. (Lo llama src/lib/seguridad.ts con fallback.)
create or replace function eventos_dobles()
returns table(player_id text, veces int)
language sql stable as $$
  select player_id, count(*)::int
  from postback_events
  where event_type in ('ftd','commission')
    and status = 'counted' and counted = true and player_id is not null
  group by player_id
  having count(*) > 1
$$;

-- ── M3 · Índice parcial para el conteo de "held" ─────────────────────────────
-- Evita el escaneo secuencial completo de postback_events en cada apertura de
-- Actividad y en cada tick del cron. Ocupa casi nada (solo las filas held).
create index if not exists idx_postback_events_held
  on public.postback_events (created_at desc)
  where status = 'held';

-- ── A4 · Blindaje de las columnas de BILLETERA de cobro ──────────────────────
-- Que NADIE pueda cambiar la wallet con la anon key desde el navegador: el cambio
-- de wallet DEBE ir SIEMPRE por el endpoint de servidor /api/account/wallets, que
-- exige la contraseña actual (para que un token robado no desvíe tus pagos). Si el
-- privilegio no existía, este REVOKE es un no-op inofensivo.
revoke update (wallet_erc20, wallet_trc20) on public.affiliates from authenticated;
