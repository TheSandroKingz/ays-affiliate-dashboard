-- ============================================================================
-- Caja negra de postbacks (registro de auditoría del dinero)
-- ----------------------------------------------------------------------------
-- Guarda CADA postback recibido de freshbet (registro / FTD / comisión) con
-- sus parámetros crudos y el resultado (contado, duplicado, sin emparejar,
-- error). Sirve para:
--   * verificar qué manda freshbet (p. ej. si trae player_id, el anti-duplicado)
--   * revisar cuadres de dinero y tener prueba de cada evento
--   * detectar fraude (mismo jugador / IP repetidos)
--
-- Solo la escriben las rutas de postback (service role). Con RLS activado y SIN
-- políticas, ni el rol anónimo ni el autenticado pueden leerla desde el
-- navegador: es privada. Ejecuta este archivo una vez en el editor SQL de
-- Supabase. Es idempotente (se puede volver a ejecutar sin romper nada).
-- ============================================================================

create table if not exists public.postback_events (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  event_type      text        not null,          -- 'registration' | 'ftd' | 'commission'
  raw_query       text,                           -- query cruda de freshbet (sin el secreto)
  tracking_code   text,
  afp             text,
  player_id       text,                           -- id de jugador (candado anti-duplicado)
  isocountry      text,
  commission      numeric,                        -- CPA acreditado (si se contó)
  matched_user_id uuid,                           -- afiliado al que se atribuyó (null = sin match)
  counted         boolean     not null default false,
  status          text        not null            -- 'counted' | 'duplicate' | 'no_match' | 'error'
);

-- Índices para consultas típicas: por fecha (lo más reciente) y por jugador
-- (para detectar duplicados / fraude por player_id).
create index if not exists idx_postback_events_created
  on public.postback_events (created_at desc);
create index if not exists idx_postback_events_player
  on public.postback_events (player_id);
create index if not exists idx_postback_events_matched
  on public.postback_events (matched_user_id);

-- Privada: solo el service role (los postbacks) escribe/lee. Sin políticas =
-- inaccesible para anon/authenticated aunque tuvieran grants por defecto.
alter table public.postback_events enable row level security;
