-- ---------------------------------------------------------------------------
-- Contador diario del REVISOR (la segunda pasada de IA antes de enviar)
-- ---------------------------------------------------------------------------
-- Para saber si merece la pena tenerlo encendido: cuesta ~la mitad de la
-- factura de IA, así que hay que poder ver cuántas veces corrige algo DE VERDAD
-- y no solo cuántas veces se ejecuta.
--
-- Hasta ahora eso solo quedaba en los registros de Vercel, que se borran y no
-- se pueden consultar desde el panel.
create table if not exists public.revisor_daily (
  day            date primary key,
  total          integer not null default 0,  -- veces que se lanzó
  corrigio       integer not null default 0,  -- cambió el borrador
  sin_cambios    integer not null default 0,  -- lo dio por bueno
  saltado        integer not null default 0,  -- no dio tiempo (o no cabía)
  rechazado      integer not null default 0   -- corrigió, pero la corrección no pasó los filtros
);

alter table public.revisor_daily enable row level security;
-- Sin políticas: solo la aplicación (service role) entra. Nadie más.

-- Suma 1 al contador que toque, de forma atómica (varias respuestas a la vez no
-- se pisan). `p_campo` es uno de: corrigio, sin_cambios, saltado, rechazado.
create or replace function public.increment_revisor(p_day date, p_campo text)
returns void
language plpgsql
as $$
begin
  insert into public.revisor_daily (day, total) values (p_day, 0)
  on conflict (day) do nothing;

  update public.revisor_daily set
    total       = total + 1,
    corrigio    = corrigio    + (case when p_campo = 'corrigio'    then 1 else 0 end),
    sin_cambios = sin_cambios + (case when p_campo = 'sin_cambios' then 1 else 0 end),
    saltado     = saltado     + (case when p_campo = 'saltado'     then 1 else 0 end),
    rechazado   = rechazado   + (case when p_campo = 'rechazado'   then 1 else 0 end)
  where day = p_day;
end;
$$;

revoke all on function public.increment_revisor(date, text) from public;
revoke all on function public.increment_revisor(date, text) from anon;
revoke all on function public.increment_revisor(date, text) from authenticated;
