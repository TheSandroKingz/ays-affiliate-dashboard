-- ============================================================================
-- FASE 2 y 3 del "Aprendizaje supervisado desde el historial" (spec de Yaiza).
--   FASE 2: "datos que faltan" — info que el bot NO tenía y le pidió la gente.
--   FASE 3: bienestar (muestreo) + LISTA NEGRA (insultos/amenazas repetidos).
-- Todo REVISIÓN HUMANA. La lista negra la respeta el bot (deja de atender).
-- Correr entero en Supabase. Idempotente.
-- ============================================================================

-- FASE 2: dato que el bot no tenía (para saber qué añadir a los Datos Fijos).
alter table public.analisis_conversaciones
  add column if not exists dato_faltante text;

-- FASE 3: el jugador mostró malestar/vulnerabilidad (pérdidas, enfado, agobio).
alter table public.analisis_conversaciones
  add column if not exists bienestar boolean not null default false;

-- FASE 3: LISTA NEGRA. Jugadores bloqueados (3 insultos/amenazas seguidos). El bot
-- la respeta: si el chat está aquí, NO le responde. Sandro puede quitar a alguien.
create table if not exists public.lista_negra (
  id         bigserial primary key,
  bot        text        not null,       -- 'as'|'jeffer'|'mariam'|'blackkp'|'afrika'
  chat_id    bigint      not null,
  motivo     text,                        -- p. ej. "3 insultos/amenazas seguidos"
  created_at timestamptz not null default now(),
  unique (bot, chat_id)
);
alter table public.lista_negra enable row level security;
create index if not exists idx_lista_negra_fecha on public.lista_negra (created_at desc);
