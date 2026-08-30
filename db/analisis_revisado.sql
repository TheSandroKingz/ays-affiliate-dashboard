-- Marca "revisado" en los casos del informe (petición de Yaiza): cuando ya ha
-- revisado un caso, deja de salirle como pendiente. Correr en Supabase. Idempotente.
alter table public.analisis_conversaciones
  add column if not exists revisado boolean not null default false;
