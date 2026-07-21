-- ============================================================================
-- Fecha de nacimiento del afiliado
-- ----------------------------------------------------------------------------
-- Se pide en el registro y se puede editar en Configuración. Sirve para
-- felicitar el cumpleaños y como control de mayoría de edad. Ejecuta este
-- archivo una vez en el editor SQL de Supabase. Es idempotente.
-- ============================================================================

alter table public.affiliates
  add column if not exists birthdate date;

-- El afiliado puede VER y EDITAR su propia fecha (la fila ya la limita la RLS
-- por auth.uid() = user_id). El registro la guarda con el service role.
grant select (birthdate), update (birthdate)
  on public.affiliates to authenticated;
