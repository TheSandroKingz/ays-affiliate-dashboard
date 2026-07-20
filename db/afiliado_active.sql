-- Columna para activar/desactivar afiliados (bloquear el acceso sin borrar la
-- cuenta). Por defecto todos activos. Ejecútalo una vez en el editor SQL de
-- Supabase. Es idempotente.
alter table public.affiliates
  add column if not exists active boolean not null default true;
