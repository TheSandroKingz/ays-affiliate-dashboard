-- ============================================================================
-- Gastos mensuales del negocio (publicidad, suscripciones de Claude, etc.).
-- Sirve para que al hacer cuentas cada mes se vea, de un vistazo, cuánto se
-- gastó, en qué categoría y quién lo puso (Kingz = Sandro, PRZ = socio, o común).
-- Privada: solo el service role (endpoints /api/admin/gastos) escribe/lee.
-- Ejecútalo una vez en el editor SQL de Supabase. Idempotente.
-- ============================================================================
create table if not exists public.gastos (
  id         bigint generated always as identity primary key,
  fecha      date          not null,                 -- día del gasto (zona Madrid)
  categoria  text          not null,                 -- publicidad | claude_prog | claude_bots | otros
  quien      text          not null default 'comun', -- kingz | prz | comun
  concepto   text,                                   -- descripción libre opcional
  importe    numeric(12,2) not null,                 -- en euros
  created_at timestamptz   not null default now()
);

-- Para filtrar por mes rápido (se consulta por rango de fecha).
create index if not exists idx_gastos_fecha on public.gastos (fecha);

alter table public.gastos enable row level security;
-- Sin políticas = inaccesible para anon/authenticated. Solo el service role
-- (los endpoints de admin, protegidos con getAdminUser).
