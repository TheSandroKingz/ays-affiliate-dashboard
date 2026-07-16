-- ================================================================
--  Tabla del histórico de freshbet (solo la ve el Admin vía API).
--  Ejecuta TODO esto en Supabase -> SQL Editor -> Run.
-- ================================================================

create table if not exists public.freshbet_daily (
  day           date primary key,
  commission    numeric  not null default 0,
  clicks        integer  not null default 0,   -- "Visitors" en freshbet
  registrations integer  not null default 0,
  ftd           integer  not null default 0
);

-- Solo el service role (la API de Admin) puede leer/escribir.
alter table public.freshbet_daily enable row level security;

-- Carga inicial de tu histórico exportado (Jul 2026).
-- Re-ejecutar no duplica: actualiza el día si ya existe.
insert into public.freshbet_daily (day, commission, clicks, registrations, ftd) values
  ('2026-07-01', 233.6391, 31,  3,  3),
  ('2026-07-02', 399.7615, 179, 21, 11),
  ('2026-07-03', 380,      133, 7,  5),
  ('2026-07-04', 170,      64,  6,  7),
  ('2026-07-05', 0,        20,  0,  3),
  ('2026-07-06', 0,        30,  16, 0),
  ('2026-07-07', 1020,     60,  12, 5),
  ('2026-07-08', 255,      50,  9,  3),
  ('2026-07-09', 850,      79,  14, 10),
  ('2026-07-10', 1360,     179, 28, 18),
  ('2026-07-11', 1360,     283, 41, 16),
  ('2026-07-12', 850,      380, 32, 11),
  ('2026-07-13', 1785,     491, 51, 22),
  ('2026-07-14', 1870,     394, 45, 23),
  ('2026-07-15', 1275,     786, 35, 18),
  ('2026-07-16', 0,        11,  1,  1)
on conflict (day) do update set
  commission    = excluded.commission,
  clicks        = excluded.clicks,
  registrations = excluded.registrations,
  ftd           = excluded.ftd;
