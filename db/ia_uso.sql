-- Lo que cuesta de verdad cada llamada a la IA, con los números que devuelve
-- Anthropic en cada respuesta. Sirve para saber EXACTAMENTE dónde se va el
-- dinero (respuesta normal, regeneración, revisor...) en vez de estimarlo.
create table if not exists ia_uso (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  tipo         text not null,          -- respuesta | repeticion | regeneracion | revisor | diario | ...
  bot          text,
  modelo       text,
  entrada      integer not null default 0,  -- tokens nuevos (precio completo)
  cache_lee    integer not null default 0,  -- tokens leídos de la caché (0,1x)
  cache_escribe integer not null default 0, -- tokens escritos en la caché (1,25x)
  salida       integer not null default 0   -- tokens generados
);
create index if not exists ia_uso_created_at on ia_uso (created_at);

-- Solo el servidor escribe aquí; nadie desde el navegador.
alter table ia_uso enable row level security;
