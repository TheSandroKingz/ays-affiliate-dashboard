-- ============================================================================
-- "Aprender": base de FAQ que el bot usa para responder mejor. La sección
-- /admin/aprender lee las conversaciones reales, te PROPONE respuestas y tú las
-- APRUEBAS con un clic → se guardan aquí y el bot las mete en su prompt.
-- Privada: solo el service role (webhook lee, panel admin escribe). Idempotente.
-- Ejecútalo UNA vez en el editor SQL de Supabase.
-- ============================================================================
create table if not exists public.bot_faq (
  id         uuid        primary key default gen_random_uuid(),
  tema       text        not null,   -- de qué va (para el panel)
  respuesta  text        not null,   -- la pauta/respuesta que el bot usará
  enabled    boolean     not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_bot_faq_enabled
  on public.bot_faq (enabled) where enabled;

alter table public.bot_faq enable row level security;
-- Sin políticas = inaccesible para anon/authenticated. Solo el service role
-- (webhook y endpoints admin, que usan la service key).
