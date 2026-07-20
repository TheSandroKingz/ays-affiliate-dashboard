-- Contador de visitas al dashboard por afiliado y día (para ver quién está
-- pendiente / entra a menudo). Ejecútalo una vez en el editor SQL de Supabase.
-- Idempotente.
create table if not exists public.dashboard_visits (
  user_id uuid not null references auth.users(id) on delete cascade,
  date    date not null,
  count   integer not null default 0,
  primary key (user_id, date)
);
alter table public.dashboard_visits enable row level security;

-- Suma una visita de forma atómica.
create or replace function public.increment_visit(p_user_id uuid, p_date date)
returns void
language sql
as $$
  insert into public.dashboard_visits as v (user_id, date, count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date) do update set count = v.count + 1;
$$;
