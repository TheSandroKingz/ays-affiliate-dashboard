-- Gastos que apunta cada afiliado (lo que invierte en publicidad, etc.) para ver
-- lo que le queda limpio. Sin categorías: el concepto lo escribe él.
-- Solo se accede por la API del servidor: cada afiliado ve los suyos y el admin
-- los de cualquiera desde la ficha del afiliado.
create table if not exists gastos_afiliados (
  id         bigserial primary key,
  user_id    uuid not null,
  fecha      date not null,
  concepto   text not null,
  importe    numeric(12,2) not null check (importe > 0),
  created_at timestamptz not null default now()
);
create index if not exists gastos_afiliados_user_fecha on gastos_afiliados (user_id, fecha);
alter table gastos_afiliados enable row level security;
