-- ============================================================================
-- Biblioteca de EJEMPLOS del dueño ("así juego yo"). Varios vídeos/fotos reales
-- que el bot manda ROTANDO (uno distinto al azar) cuando alguien pide el patrón
-- o dice que "no le funciona". Contenido REAL del dueño, no patrones inventados.
-- El dueño los sube mandando al bot "/ejemplo" con el vídeo/foto en el pie.
-- Privada: solo el service role (webhook) escribe/lee. Idempotente.
-- ============================================================================
create table if not exists public.telegram_examples (
  id         bigint generated always as identity primary key,
  media_type text        not null,   -- video | photo | animation | document
  file_id    text        not null,   -- id del archivo en Telegram (se reutiliza)
  enabled    boolean     not null default true,
  created_at timestamptz not null default now()
);
alter table public.telegram_examples enable row level security;
-- Sin políticas = inaccesible para anon/authenticated. Solo el service role.
