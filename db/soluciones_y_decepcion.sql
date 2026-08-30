-- ============================================================================
-- ADENDAS del "Aprendizaje supervisado desde el historial" (spec de Yaiza).
--   A) Decepción explícita con el bot  → columna nueva en analisis_conversaciones.
--   B) Banco de soluciones verificadas → tablas nuevas.
-- Todo es REVISIÓN HUMANA: el bot solo usa soluciones APROBADAS por Yaiza.
-- ⛔ Solo arreglos TÉCNICOS/de soporte, NUNCA tácticas de persuasión/depósito.
-- Correr entero en Supabase. Idempotente.
-- ============================================================================

-- A) DECEPCIÓN CON EL BOT (Adenda 2): el jugador se quejó DIRECTAMENTE del bot
-- (su servicio/respuestas), no de sus pérdidas ni del casino. Solo informativo.
alter table public.analisis_conversaciones
  add column if not exists decepcion_bot boolean not null default false;

-- B) BANCO DE SOLUCIONES VERIFICADAS (Adenda 1).
-- Una fila por solución técnica que funcionó y quedó confirmada por el jugador.
create table if not exists public.soluciones_verificadas (
  id                  bigserial primary key,
  problema            text        not null,   -- descripción del problema (para emparejar)
  solucion            text        not null,   -- la solución que funcionó
  estado              text        not null default 'pendiente', -- 'pendiente'|'aprobada'|'descartada'
  bot                 text,                    -- 'as'|'jeffer'|'mariam'|'blackkp'|'afrika' (o null = común)
  origen_bot          text,                    -- conversación de origen (bot)
  origen_chat_id      bigint,                  -- conversación de origen (chat_id) para trazabilidad
  veces_reutilizada   int         not null default 0, -- total (conveniencia; el detalle va en _usos)
  posible_duplicado_de bigint      references public.soluciones_verificadas(id) on delete set null,
  fecha_deteccion     timestamptz not null default now(),
  fecha_aprobacion    timestamptz,             -- vacío hasta que Yaiza la apruebe
  unique (origen_bot, origen_chat_id)          -- una solución por conversación de origen
);
alter table public.soluciones_verificadas enable row level security;
create index if not exists idx_solv_estado on public.soluciones_verificadas (estado, bot);
create index if not exists idx_solv_deteccion on public.soluciones_verificadas (fecha_deteccion desc);

-- Log de REUTILIZACIONES: cada vez que el bot usa una solución aprobada con otro
-- jugador. Permite contar "reutilizadas EN EL PERIODO" (no solo el total).
create table if not exists public.soluciones_verificadas_usos (
  id           bigserial primary key,
  solucion_id  bigint not null references public.soluciones_verificadas(id) on delete cascade,
  bot          text,
  chat_id      bigint,
  created_at   timestamptz not null default now()
);
alter table public.soluciones_verificadas_usos enable row level security;
create index if not exists idx_solv_usos_fecha on public.soluciones_verificadas_usos (created_at desc);
create index if not exists idx_solv_usos_sol on public.soluciones_verificadas_usos (solucion_id);
