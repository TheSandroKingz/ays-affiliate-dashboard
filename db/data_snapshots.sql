-- Copias de seguridad automáticas diarias (el cron /api/cron/backup escribe aquí
-- una "foto" de affiliates + affiliate_daily_stats + payments). Permite
-- restaurar si se corrompe o borra algo por error. Privada (solo service role).
-- Ejecútalo una vez en el editor SQL de Supabase. Es idempotente.
create table if not exists public.data_snapshots (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  data       jsonb not null
);
create index if not exists idx_data_snapshots_created
  on public.data_snapshots (created_at desc);
alter table public.data_snapshots enable row level security;
