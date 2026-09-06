-- Penalizaciones / dinero restado por el casino a fin de mes (p. ej. Celsius nos
-- restó 6.120€ en agosto). Es un dato MANUAL por mes: no se puede derivar de los
-- postbacks, así que lo guardamos aquí y se resta del beneficio en la Memoria del
-- negocio para que las cifras sean reales.
create table if not exists penalizaciones (
  mes text primary key,                       -- 'YYYY-MM'
  importe numeric not null default 0,         -- € restados (positivo)
  updated_at timestamptz not null default now()
);

-- Solo el backend (service role) toca esta tabla; nadie más.
alter table penalizaciones enable row level security;
