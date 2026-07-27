-- ============================================================================
-- Contactos del bot de Telegram (jugadores que le han dado a "Empezar").
-- Un bot de Telegram SOLO puede escribir a quien primero le escribió, así que
-- aquí guardamos a cada uno que se une para poder mandarle mensajes en masa.
-- Privada: solo el service role (webhook/broadcast) escribe/lee. Ejecútalo una
-- vez en el editor SQL de Supabase. Idempotente.
-- ============================================================================
create table if not exists public.telegram_contacts (
  chat_id     bigint      primary key,          -- id de chat de Telegram
  first_name  text,
  username    text,
  joined_at   timestamptz not null default now(),
  last_msg_at timestamptz,                        -- última vez que escribió
  opted_out   boolean     not null default false  -- se dio de baja (/stop)
);

create index if not exists idx_telegram_contacts_activos
  on public.telegram_contacts (opted_out) where not opted_out;

alter table public.telegram_contacts enable row level security;
-- Sin políticas = inaccesible para anon/authenticated. Solo el service role.
