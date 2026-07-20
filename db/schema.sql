-- ============================================================================
-- ESQUEMA DE REFERENCIA — A&S Afiliados
-- ----------------------------------------------------------------------------
-- Documentación de la estructura de la base de datos (tablas, índices, función
-- de conteo, seguridad) para poder RECONSTRUIRLA en un proyecto nuevo de
-- Supabase si algún día se pierde o hay que migrar.
--
-- ⚠️ NO ejecutes este archivo entero sobre la base de datos EN VIVO. Está
--    pensado para levantar un proyecto DESDE CERO. Sobre la BD actual, las
--    tablas ya existen (los `create ... if not exists` no harían nada) pero las
--    políticas/función se recrearían y NO merece la pena arriesgar.
--
-- Este archivo se mantiene a mano. Refleja lo verificado empíricamente
-- (constraints UNIQUE, conteo atómico, RLS que aísla por usuario y grants por
-- columna que impiden la auto-escalada). Los tipos exactos pueden requerir
-- pequeños ajustes; contrástalo con la BM en vivo antes de un rebuild real.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) AFILIADOS
-- ---------------------------------------------------------------------------
create table if not exists public.affiliates (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references auth.users(id) on delete cascade,
  display_name             text unique,
  first_name               text,
  last_name                text,
  phone                    text,
  avatar_url               text,
  promo_link               text,
  referred_by              uuid references public.affiliates(id),
  subaffiliate_percent     numeric default 5,
  cpa_spain                numeric default 0,
  cpa_other                numeric default 0,
  wallet_erc20             text,
  wallet_trc20             text,
  freshaffs_tracking_code  text,
  freshaffs_affiliate_id   text,
  approved                 boolean not null default false,
  accepted_terms           boolean default false,
  accepted_privacy         boolean default false,
  created_at               timestamptz not null default now()
);
create index if not exists idx_affiliates_user_id       on public.affiliates (user_id);
create index if not exists idx_affiliates_referred_by   on public.affiliates (referred_by);
create index if not exists idx_affiliates_approved      on public.affiliates (approved);
create index if not exists idx_affiliates_tracking_code on public.affiliates (freshaffs_tracking_code);
create index if not exists idx_affiliates_afp           on public.affiliates (freshaffs_affiliate_id);

-- ---------------------------------------------------------------------------
-- 2) ESTADÍSTICAS DIARIAS (una fila por afiliado y día)
-- ---------------------------------------------------------------------------
create table if not exists public.affiliate_daily_stats (
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  clicks        integer not null default 0,
  registrations integer not null default 0,
  ftd           integer not null default 0,
  commission    numeric not null default 0,
  primary key (user_id, date)   -- clave única exigida por el upsert/RPC
);
create index if not exists idx_daily_user_date on public.affiliate_daily_stats (user_id, date);

-- ---------------------------------------------------------------------------
-- 3) PAGOS
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_user on public.payments (user_id);

-- ---------------------------------------------------------------------------
-- 4) DEDUPLICACIÓN (anti doble-conteo)
-- ---------------------------------------------------------------------------
-- Clic: clave `code:ip:bucket` única -> un clic repetido no cuenta.
create table if not exists public.click_dedup (
  key        text primary key,
  created_at timestamptz not null default now()
);
create index if not exists idx_click_dedup_created on public.click_dedup (created_at);

-- Postback: clave `ftd:playerid` / `reg:playerid` única -> evento no se repite.
create table if not exists public.postback_dedup (
  event_key  text primary key,
  created_at timestamptz not null default now()
);

-- Caja negra de eventos: ver db/postback_events.sql (definición completa allí).

-- ---------------------------------------------------------------------------
-- 5) FUNCIÓN DE CONTEO (atómica: incremento sin perder actualizaciones)
-- ---------------------------------------------------------------------------
-- Suma de forma segura ante concurrencia gracias al UPDATE con lock de fila del
-- `on conflict do update`. Verificado: llamarla 2 veces suma 2, no se pisa.
create or replace function public.increment_daily_stats(
  p_user_id       uuid,
  p_date          date,
  p_clicks        integer default 0,
  p_registrations integer default 0,
  p_ftd           integer default 0,
  p_commission    numeric default 0
) returns void
language sql
as $$
  insert into public.affiliate_daily_stats as s
    (user_id, date, clicks, registrations, ftd, commission)
  values
    (p_user_id, p_date, p_clicks, p_registrations, p_ftd, p_commission)
  on conflict (user_id, date) do update set
    clicks        = s.clicks        + excluded.clicks,
    registrations = s.registrations + excluded.registrations,
    ftd           = s.ftd           + excluded.ftd,
    commission    = s.commission    + excluded.commission;
$$;

-- ---------------------------------------------------------------------------
-- 6) SEGURIDAD (RLS + grants por columna) — verificado empíricamente
-- ---------------------------------------------------------------------------
-- Objetivo probado en producción:
--   * Un afiliado autenticado SOLO ve su propia fila (no fuga de datos).
--   * NO puede cambiarse approved / cpa_* / subaffiliate_percent (no escalada).
--   * Puede editar solo columnas de perfil (nombre, avatar, teléfono, wallets).
--
-- Aislamiento por fila:
alter table public.affiliates            enable row level security;
alter table public.affiliate_daily_stats enable row level security;
alter table public.payments              enable row level security;
-- (postback_events, click_dedup, postback_dedup: RLS on y SIN políticas =
--  privadas, solo accesibles por el service role de los postbacks/cron.)

-- Ejemplo de políticas de solo-lectura de la propia fila (ajústalas a tu setup):
--   create policy "afiliado ve su fila" on public.affiliates
--     for select to authenticated using (user_id = auth.uid());
--   create policy "afiliado ve sus stats" on public.affiliate_daily_stats
--     for select to authenticated using (user_id = auth.uid());
--   create policy "afiliado ve sus pagos" on public.payments
--     for select to authenticated using (user_id = auth.uid());

-- Escritura por columna en affiliates: se revoca el UPDATE general y se conceden
-- SOLO las columnas de perfil (esto es lo que impide la auto-escalada):
--   revoke update on public.affiliates from anon, authenticated;
--   grant  update (display_name, first_name, last_name, phone, avatar_url,
--                  wallet_erc20, wallet_trc20)
--     on public.affiliates to authenticated;
--   create policy "afiliado edita su fila" on public.affiliates
--     for update to authenticated using (user_id = auth.uid())
--     with check (user_id = auth.uid());
