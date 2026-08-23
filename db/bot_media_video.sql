-- Ver los VÍDEOS (no solo la miniatura) en el visor de chats del panel.
--
-- Hasta ahora, de un vídeo del jugador se guardaba SOLO la miniatura en
-- `file_id` (un fotograma, que la IA usa para "ver" el clip). Para poder
-- REPRODUCIR el vídeo real en el panel añadimos `full_file_id`: el file_id del
-- archivo completo (vídeo/animación). La miniatura sigue en `file_id` (visión).
--
-- También el mensaje del BOT cuando manda el vídeo del patrón guarda ahora su
-- file_id aquí, para poder reproducirlo en el visor.
--
-- Aditivo y seguro: columna nueva, nullable. Los vídeos ANTIGUOS (que solo
-- tienen miniatura) no se podrán reproducir; los NUEVOS sí.

alter table if exists public.bot_messages
  add column if not exists full_file_id text;

alter table if exists public.telegram_messages
  add column if not exists full_file_id text;
