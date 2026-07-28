-- ============================================================================
-- ARREGLO anti auto-escalada en `affiliates`.
-- Quita el permiso GENERAL de UPDATE del rol authenticated/anon (ahí estaba el
-- agujero: dejaba que un afiliado se cambiara approved / cpa_* /
-- subaffiliate_percent desde el navegador) y concede SOLO las columnas de perfil
-- que la web edita de verdad. Las wallets se editan por un endpoint de servidor
-- (service role), así que NO necesitan permiso aquí.
-- Ejecútalo una vez en el editor SQL de Supabase. Idempotente.
--
-- Columnas de perfil que la web edita desde el navegador (verificado en el
-- código): display_name, avatar_url, notif_ftd, notif_registro, birthdate.
-- ============================================================================

revoke update on public.affiliates from anon, authenticated;

grant update (display_name, avatar_url, notif_ftd, notif_registro)
  on public.affiliates to authenticated;

-- birthdate: solo si la columna existe en tu esquema (evita error si no la tienes).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'affiliates'
      and column_name = 'birthdate'
  ) then
    execute 'grant update (birthdate) on public.affiliates to authenticated';
  end if;
end $$;

-- NOTA: esto NO toca las políticas RLS (que ya limitan cada afiliado a SU fila).
-- Solo cambia QUÉ columnas puede tocar. Tras ejecutarlo, vuelve a correr
-- db/verificar-permisos.sql: las dos primeras consultas deben salir VACÍAS.
