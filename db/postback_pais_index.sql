-- Índice para acelerar el bloque "De dónde vienen" del inicio de admin, que
-- filtra postback_events por event_type IN (ftd, commission) AND counted = true.
-- Índice PARCIAL (solo filas contadas): pequeño y directo. Ejecútalo una vez en
-- el editor SQL de Supabase. Idempotente.
create index if not exists idx_postback_events_pais
  on public.postback_events (event_type)
  where counted;
