-- ================================================================
--  Opción B: sumar automáticamente los eventos de freshbet al total.
--  Versión null-safe (COALESCE): aunque llegue un valor nulo, nunca
--  pone el total a null.
--  Ejecuta TODO esto en Supabase -> SQL Editor -> Run.
-- ================================================================

create or replace function public.increment_freshbet_daily(
  p_date          date,
  p_registrations integer default 0,
  p_ftd           integer default 0,
  p_commission    numeric default 0,
  p_clicks        integer default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.freshbet_daily (day, commission, clicks, registrations, ftd)
  values (
    p_date,
    coalesce(p_commission, 0),
    coalesce(p_clicks, 0),
    coalesce(p_registrations, 0),
    coalesce(p_ftd, 0)
  )
  on conflict (day) do update set
    commission    = coalesce(public.freshbet_daily.commission, 0)    + coalesce(excluded.commission, 0),
    clicks        = coalesce(public.freshbet_daily.clicks, 0)        + coalesce(excluded.clicks, 0),
    registrations = coalesce(public.freshbet_daily.registrations, 0) + coalesce(excluded.registrations, 0),
    ftd           = coalesce(public.freshbet_daily.ftd, 0)           + coalesce(excluded.ftd, 0);
end;
$$;
