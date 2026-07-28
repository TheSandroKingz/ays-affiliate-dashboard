-- ============================================================================
-- Bloqueo anti-fuerza-bruta POR CUENTA (compartido entre servidores, atómico).
-- El límite por IP (rateLimit en memoria) se evade en serverless porque cada
-- instancia tiene su propio contador; esto añade un freno por CUENTA que sí es
-- global: tras N fallos en la ventana, la cuenta queda bloqueada un rato aunque
-- el atacante cambie de IP. Ejecútalo una vez en el editor SQL de Supabase.
-- Idempotente.
-- ============================================================================
create table if not exists public.login_intentos (
  k       text        primary key,           -- clave por cuenta (login:<email>)
  fallos  integer     not null default 0,
  primer  timestamptz not null default now() -- inicio de la ventana actual
);
alter table public.login_intentos enable row level security;
-- Sin políticas = solo el service role (las rutas server) accede.

-- Registra un fallo de login de forma ATÓMICA: si la ventana expiró, reinicia el
-- contador; si no, lo incrementa. Devuelve los fallos de la ventana actual.
create or replace function public.login_fallo(p_key text, p_ventana_ms integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.login_intentos (k, fallos, primer)
  values (p_key, 1, now())
  on conflict (k) do update set
    fallos = case
      when now() - login_intentos.primer > (p_ventana_ms || ' milliseconds')::interval
        then 1 else login_intentos.fallos + 1 end,
    primer = case
      when now() - login_intentos.primer > (p_ventana_ms || ' milliseconds')::interval
        then now() else login_intentos.primer end
  returning fallos into n;
  return n;
end;
$$;
