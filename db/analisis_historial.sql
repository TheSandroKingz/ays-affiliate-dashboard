-- ============================================================================
-- APRENDIZAJE SUPERVISADO DESDE EL HISTORIAL (Fase 1: clasificación técnica)
-- Backend APARTE del bot: clasifica conversaciones cerradas y genera informes
-- para revisión HUMANA. NO ajusta el bot solo. NO mide "éxito" por depósito ni
-- analiza qué frases hacen depositar. Correr entero en Supabase. Idempotente.
-- ============================================================================

-- Una fila por conversación clasificada (para no re-clasificar lo mismo).
create table if not exists public.analisis_conversaciones (
  id               bigserial primary key,
  bot              text        not null,   -- 'as','jeffer','mariam','blackkp','afrika'
  chat_id          bigint      not null,
  ultimo_msg       timestamptz not null,   -- último mensaje de la conversación analizada
  tipo_duda        text,                   -- deposito/retiro/bono/acceso/juego/patron/pago/social/otro
  problema_tecnico boolean     not null default false,
  resuelto         text,                   -- 'resuelto'|'no_resuelto'|'sin_determinar' (null si no hubo problema)
  derivado_soporte boolean     not null default false,
  categoria        text,                   -- 'no_registrado'|'registrado'|'recurrente'
  friccion_abandono boolean    not null default false, -- mostró intención de depositar y se cortó por duda técnica sin resolver
  resumen          text,                   -- 1 frase objetiva de qué pasó
  created_at       timestamptz not null default now(),
  unique (bot, chat_id, ultimo_msg)        -- misma conversación+estado = no repetir
);
alter table public.analisis_conversaciones enable row level security;
create index if not exists idx_analisis_conv_fecha on public.analisis_conversaciones (created_at desc);

-- Informe agregado de cada periodo (cada ~3 días).
create table if not exists public.analisis_informes (
  id         bigserial primary key,
  desde      timestamptz not null,
  hasta      timestamptz not null,
  datos      jsonb       not null,          -- resumen agregado (problemas comunes, tasas, derivaciones, fricciones)
  created_at timestamptz not null default now()
);
alter table public.analisis_informes enable row level security;
create index if not exists idx_analisis_informes_fecha on public.analisis_informes (created_at desc);

-- Config ajustable por Yaiza (umbral de prioridad, control del intervalo).
create table if not exists public.analisis_config (
  id           int primary key default 1,
  umbral       int not null default 5,      -- nº de jugadores distintos para marcar un tema como prioritario
  ultimo_run   timestamptz,                 -- última vez que se corrió el análisis (para el intervalo de 3 días)
  ultimo_informe timestamptz                -- última vez que se generó un informe
);
alter table public.analisis_config enable row level security;
insert into public.analisis_config (id) values (1) on conflict (id) do nothing;
