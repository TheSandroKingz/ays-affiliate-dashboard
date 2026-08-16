-- ============================================================================
-- Meses ya "saldados" en el apartado de Gastos: cuando los socios se han pagado
-- lo que se debían ese mes, se marca aquí para que la liquidación diga "saldado"
-- en vez de seguir mostrando la deuda. Los gastos NO se borran.
-- Ejecútalo una vez en el editor SQL de Supabase. Idempotente.
-- ============================================================================
create table if not exists public.gastos_saldos (
  mes        text        primary key,            -- 'YYYY-MM'
  saldado_at timestamptz not null default now(),
  detalle    text                                -- p. ej. "PRZ pagó €50,23 a Kingz"
);
alter table public.gastos_saldos enable row level security;
-- Sin políticas = solo el service role (endpoints de admin).
