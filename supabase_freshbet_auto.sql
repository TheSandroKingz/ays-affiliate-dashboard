-- ================================================================
--  Opción B: sumar automáticamente los eventos de freshbet al total.
--  Cada postback (registro / FTD / comisión) llama a esta función y
--  va incrementando el día correspondiente en freshbet_daily.
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
  values (p_date, p_commission, p_clicks, p_registrations, p_ftd)
  on conflict (day) do update set
    commission    = public.freshbet_daily.commission    + excluded.commission,
    clicks        = public.freshbet_daily.clicks        + excluded.clicks,
    registrations = public.freshbet_daily.registrations + excluded.registrations,
    ftd           = public.freshbet_daily.ftd           + excluded.ftd;
end;
$$;
