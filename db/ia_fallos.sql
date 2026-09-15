-- Cada vez que un bot NO consigue respuesta de la IA, el motivo. Existe porque el
-- 15-sep un jugador listo para depositar ("820") se quedó sin contestar y no había
-- forma de saber por qué: el error se tragaba en silencio.
create table if not exists ia_fallos (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  bot        text,
  chat_id    bigint,
  motivo     text not null
);
create index if not exists ia_fallos_created_at on ia_fallos (created_at);
alter table ia_fallos enable row level security;
