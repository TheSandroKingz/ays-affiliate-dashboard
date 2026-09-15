-- Configuración de Gastos de cada afiliado (la hace la primera vez que entra):
-- cuántos socios son, sus nombres y sus conceptos con el % que pone cada uno.
-- miembros = {"socios":["Alan","Afrika"],"conceptos":[{"nombre":"Publicidad","pct":[50,50]}]}
-- (socios [] = trabaja solo; los conceptos van sin %)
create table if not exists reparto_gastos_afiliados (
  user_id    uuid primary key,
  miembros   jsonb not null,
  updated_at timestamptz not null default now()
);
alter table reparto_gastos_afiliados enable row level security;
