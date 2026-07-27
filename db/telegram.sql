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

-- Memoria de la conversación (para que la IA responda con contexto). Guardamos
-- solo los últimos turnos: [{role:"user"|"assistant", content:"..."}]. Idempotente.
alter table public.telegram_contacts
  add column if not exists history jsonb not null default '[]'::jsonb;

-- Última vez que el bot "picó" a un dormido (para no repetir cada día).
alter table public.telegram_contacts
  add column if not exists last_poke_at timestamptz;

-- Límite anti-spam de la IA (para no quemar el saldo de Claude): contamos los
-- mensajes por ventana de 1 minuto y por usuario.
alter table public.telegram_contacts
  add column if not exists ai_window_start timestamptz;
alter table public.telegram_contacts
  add column if not exists ai_count integer not null default 0;

-- Silenciado por el dueño: el bot lo ignora del todo (ni responde, ni reenvía,
-- ni le manda envíos). Para cortar a un pesado desde el panel.
alter table public.telegram_contacts
  add column if not exists silenced boolean not null default false;

alter table public.telegram_contacts enable row level security;
-- Sin políticas = inaccesible para anon/authenticated. Solo el service role.

-- ============================================================================
-- Mensaje diario automático. El dueño manda al bot "/diario" con un vídeo/foto
-- (o texto) y se guarda aquí; cada mañana el cron lo reenvía a todos. Una sola
-- fila (id=1). El file_id es el id del archivo en Telegram, se reutiliza.
-- ============================================================================
create table if not exists public.telegram_daily (
  id         smallint     primary key default 1,
  media_type text,                                  -- video|photo|animation|document|text
  file_id    text,                                  -- id del archivo en Telegram
  caption    text,                                  -- texto que acompaña
  enabled    boolean      not null default true,
  updated_at timestamptz  not null default now(),
  constraint telegram_daily_singleton check (id = 1)
);
alter table public.telegram_daily enable row level security;

-- ============================================================================
-- Anti-duplicados: Telegram reintenta un update si tardamos en responder. Aquí
-- guardamos los update_id ya procesados para no procesarlos dos veces (evita
-- respuestas dobles y gasto doble de IA). El cron diario limpia los viejos.
-- ============================================================================
create table if not exists public.telegram_updates (
  update_id  bigint      primary key,
  created_at timestamptz not null default now()
);
alter table public.telegram_updates enable row level security;

-- Tope global de llamadas a la IA por día (blinda el saldo de Claude). Una fila
-- por día con el contador.
create table if not exists public.telegram_ai_daily (
  day   date    primary key,
  count integer not null default 0
);
alter table public.telegram_ai_daily enable row level security;

-- Config del bot: la "promo activa" que el bot menciona (bonos/recargas reales).
create table if not exists public.telegram_config (
  id         smallint    primary key default 1,
  promo      text,
  updated_at timestamptz not null default now(),
  constraint telegram_config_singleton check (id = 1)
);
alter table public.telegram_config enable row level security;

-- Limpieza automática de chats: guardamos los message_id enviados/recibidos para
-- borrarlos luego (Telegram solo deja borrar mensajes de menos de 48h).
create table if not exists public.telegram_sent (
  chat_id    bigint      not null,
  message_id bigint      not null,
  created_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);
create index if not exists idx_telegram_sent_created
  on public.telegram_sent (created_at);
alter table public.telegram_sent enable row level security;

-- Vídeo/foto de bienvenida opcional (se envía con /start). Si no hay, solo texto.
create table if not exists public.telegram_welcome (
  id         smallint    primary key default 1,
  media_type text,
  file_id    text,
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now(),
  constraint telegram_welcome_singleton check (id = 1)
);
alter table public.telegram_welcome enable row level security;
