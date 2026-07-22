-- ============================================================================
-- Preferencias de notificaciones por usuario
-- ----------------------------------------------------------------------------
-- Cada persona elige de qué quiere que le avise el móvil: FTD y/o registros.
-- Por defecto ambos activados. El servidor consulta estas columnas antes de
-- enviar cada push. Ejecuta este archivo una vez en el editor SQL de Supabase.
-- Es idempotente.
-- ============================================================================

alter table public.affiliates
  add column if not exists notif_ftd      boolean not null default true,
  add column if not exists notif_registro boolean not null default true;

-- El afiliado puede ver y editar SUS preferencias (RLS limita a su fila).
grant select (notif_ftd, notif_registro),
      update (notif_ftd, notif_registro)
  on public.affiliates to authenticated;
