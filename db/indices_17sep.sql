-- Índices que faltan, salidos de la revisión a fondo del 17-sep-2026.
-- Todos son CREATE INDEX IF NOT EXISTS: se pueden correr las veces que haga falta
-- y no tocan ni un dato. Tamaños de ese día: telegram_messages 33.421 filas,
-- postback_events 14.948, telegram_updates 4.728, bot_messages 4.897.

-- 1) El análisis del historial filtra SOLO por fecha sobre 33.421 filas, 8 veces al
--    día. El índice que hay es (chat_id, created_at) y ahí no sirve de nada.
create index if not exists idx_telegram_messages_created
  on public.telegram_messages (created_at);

-- 2) Lo mismo para los otros bots: existe (bot, chat_id, created_at) y la consulta
--    del análisis es (bot, created_at), así que solo aprovecha el principio.
create index if not exists idx_bot_messages_bot_created
  on public.bot_messages (bot, created_at);

-- 3) Las limpiezas diarias borran por fecha, y la clave de estas tablas es el id del
--    update: sin esto, cada limpieza recorre la tabla entera.
create index if not exists idx_telegram_updates_created
  on public.telegram_updates (created_at);
create index if not exists idx_bot_updates_created
  on public.bot_updates (created_at);

-- 4) El apartado de Gastos siempre filtra por rango de fechas y no tenía ningún
--    índice. Con 82 filas da igual, pero es gratis dejarlo hecho.
create index if not exists idx_gastos_fecha on public.gastos (fecha);
