-- ============================================================================
-- Suscripciones de notificaciones push (Web Push / PWA)
-- ----------------------------------------------------------------------------
-- Guarda a qué dispositivo(s) hay que enviar una notificación push por cada
-- usuario. Cada navegador/móvil que activa las notificaciones crea una fila con
-- su "endpoint" (único) y sus claves. Al recibir un FTD o un registro, el
-- servidor manda la notificación a todas las suscripciones del afiliado (y del
-- admin). Solo la escribe/lee el service role (endpoints /api/push/*). Privada.
-- Ejecuta este archivo una vez en el editor SQL de Supabase. Es idempotente.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subs_user
  on public.push_subscriptions (user_id);

-- Privada: solo el service role (los endpoints) escribe/lee. Sin políticas =
-- inaccesible para anon/authenticated desde el navegador.
alter table public.push_subscriptions enable row level security;
