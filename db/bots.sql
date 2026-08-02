-- ============================================================================
-- SISTEMA MULTI-BOT (Jeffer, Mariam, …) — PARALELO al bot de Sandro/Kingz.
-- ----------------------------------------------------------------------------
-- El bot de Sandro sigue con SUS tablas (telegram_*) intactas. Los bots nuevos
-- viven aquí, en tablas bot_* con una columna `bot` que los separa (cada fila
-- sabe de qué bot es). Así varios bots comparten esquema sin pisarse los datos
-- (contactos, mensajes, ejemplos y config son independientes por bot).
--
-- Privadas: RLS activado y SIN políticas → solo el service role (webhook) lee y
-- escribe. Ejecuta este archivo UNA vez en el editor SQL de Supabase. Idempotente.
-- ============================================================================

-- Contactos (jugadores que le dieron a "Empezar") POR bot. La clave es (bot,
-- chat_id): la misma persona puede escribir a dos bots distintos sin colisión.
create table if not exists public.bot_contacts (
  bot             text        not null,
  chat_id         bigint      not null,
  first_name      text,
  username        text,
  joined_at       timestamptz not null default now(),
  last_msg_at     timestamptz,
  opted_out       boolean     not null default false,  -- /stop
  silenced        boolean     not null default false,   -- silenciado por el dueño
  memory_reset_at timestamptz,                          -- corte de memoria
  last_example_at timestamptz,                          -- cooldown del ejemplo/vídeo
  ai_window_start timestamptz,                          -- anti-spam por ventana
  ai_count        integer     not null default 0,
  primary key (bot, chat_id)
);
create index if not exists idx_bot_contacts_activos
  on public.bot_contacts (bot, opted_out) where not opted_out;
alter table public.bot_contacts enable row level security;

-- Historial COMPLETO de conversaciones por bot (para el panel y la memoria de IA).
create table if not exists public.bot_messages (
  id         bigint generated always as identity primary key,
  bot        text        not null,
  chat_id    bigint      not null,
  role       text        not null,       -- 'user' (jugador) | 'assistant' (bot)
  content    text        not null,
  file_id    text,                        -- foto/vídeo que mandó el jugador (panel)
  media_type text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bot_messages_chat
  on public.bot_messages (bot, chat_id, created_at);
alter table public.bot_messages enable row level security;

-- Biblioteca de EJEMPLOS ("así juego yo") por bot. El dueño sube vídeos/fotos con
-- /ejemplo y el bot rota entre ellos. Contenido REAL, no patrones inventados.
create table if not exists public.bot_examples (
  id         bigint generated always as identity primary key,
  bot        text        not null,
  media_type text,
  file_id    text,
  enabled    boolean     not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_bot_examples_bot
  on public.bot_examples (bot, enabled);
alter table public.bot_examples enable row level security;

-- Config por bot (una fila por bot): promo activa + vídeo de bienvenida + mensaje
-- diario. Sustituye a las tablas singleton (telegram_welcome/daily/config) del bot
-- de Sandro, aquí unificadas y con clave `bot`.
create table if not exists public.bot_config (
  bot                text        primary key,
  promo              text,
  welcome_text       text,                          -- override del texto de bienvenida
  welcome_media_type text,
  welcome_file_id    text,
  welcome_enabled    boolean     not null default true,
  daily_media_type   text,
  daily_file_id      text,
  daily_caption      text,
  daily_enabled      boolean     not null default true,
  updated_at         timestamptz not null default now()
);
alter table public.bot_config enable row level security;

-- Anti-duplicados por bot: Telegram reintenta updates y el update_id NO es único
-- entre bots distintos, así que la clave es (bot, update_id).
create table if not exists public.bot_updates (
  bot        text        not null,
  update_id  bigint      not null,
  created_at timestamptz not null default now(),
  primary key (bot, update_id)
);
alter table public.bot_updates enable row level security;

-- Tope global de IA por día y por bot (blinda el saldo de Claude por separado).
create table if not exists public.bot_ai_daily (
  bot   text    not null,
  day   date    not null,
  count integer not null default 0,
  primary key (bot, day)
);
alter table public.bot_ai_daily enable row level security;

-- Incremento ATÓMICO del contador diario de IA por bot (mismo patrón que el de
-- Sandro, pero con clave por bot). Reserva un hueco y devuelve el nuevo total.
create or replace function public.increment_bot_ai_daily(p_bot text, p_day date)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.bot_ai_daily (bot, day, count)
  values (p_bot, p_day, 1)
  on conflict (bot, day) do update set count = bot_ai_daily.count + 1
  returning count;
$$;

-- Rate-limit anti-spam POR USUARIO y bot, ATÓMICO: incrementa dentro de la
-- ventana o la reinicia si expiró; devuelve los mensajes de la ventana. Si el
-- contacto aún no existe, devuelve NULL y no bloquea.
create or replace function public.bump_bot_ai_user(p_bot text, p_chat_id bigint, p_ventana_ms integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.bot_contacts
  set
    ai_count = case
      when ai_window_start is null
        or now() - ai_window_start > (p_ventana_ms || ' milliseconds')::interval
        then 1 else ai_count + 1 end,
    ai_window_start = case
      when ai_window_start is null
        or now() - ai_window_start > (p_ventana_ms || ' milliseconds')::interval
        then now() else ai_window_start end
  where bot = p_bot and chat_id = p_chat_id
  returning ai_count into n;
  return n;
end;
$$;
