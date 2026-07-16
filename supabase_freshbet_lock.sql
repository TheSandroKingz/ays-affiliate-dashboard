-- ================================================================
--  SEGURIDAD: que SOLO tu servidor pueda sumar al total de freshbet.
--  Sin esto, cualquiera podría llamar a la función e inflar tu total.
--  Ejecuta TODO esto en Supabase -> SQL Editor -> Run.
-- ================================================================

revoke all on function public.increment_freshbet_daily(date, integer, integer, numeric, integer)
  from public, anon, authenticated;

grant execute on function public.increment_freshbet_daily(date, integer, integer, numeric, integer)
  to service_role;
