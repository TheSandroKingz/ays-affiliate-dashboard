-- ⚡ Previews de chats (estilo WhatsApp) sin bajar miles de filas.
-- Antes se traían hasta 4000 mensajes por tabla y se reducía en memoria a 1 por
-- chat; si 3-4 chats muy activos copaban las 4000, el resto salía SIN preview.
-- distinct on (chat_id) devuelve EXACTAMENTE 1 fila por chat (la más nueva),
-- acotado a los chats que se muestran (p_ids). El código los usa con fallback:
-- si estos RPC no existen aún, sigue funcionando con la consulta antigua.

create or replace function tg_ultimos(p_ids bigint[])
returns table(chat_id bigint, role text, content text, media_type text)
language sql stable as $$
  select distinct on (chat_id) chat_id, role, content, media_type
  from telegram_messages
  where chat_id = any(p_ids)
  order by chat_id, created_at desc
$$;

create or replace function bot_ultimos(p_bot text, p_ids bigint[])
returns table(chat_id bigint, role text, content text, media_type text)
language sql stable as $$
  select distinct on (chat_id) chat_id, role, content, media_type
  from bot_messages
  where bot = p_bot and chat_id = any(p_ids)
  order by chat_id, created_at desc
$$;
