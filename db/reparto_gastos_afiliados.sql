-- Reparto de gastos de los afiliados que trabajan en equipo (p. ej. iAfrika: Alan y
-- Afrika): quiénes son y qué % le toca a cada uno, como Kingz/PRZ en el del admin.
-- miembros = [{"nombre":"Alan","pct":50},{"nombre":"Afrika","pct":50}]
create table if not exists reparto_gastos_afiliados (
  user_id    uuid primary key,
  miembros   jsonb not null,
  updated_at timestamptz not null default now()
);
alter table reparto_gastos_afiliados enable row level security;
