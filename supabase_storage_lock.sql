-- ================================================================
--  SEGURIDAD del almacenamiento de fotos (bucket 'avatars').
--  Cada afiliado solo puede subir/editar/borrar EN SU PROPIA carpeta
--  (que se llama con su user_id). La lectura sigue siendo pública
--  (las fotos se muestran en la web).
--  Ejecuta TODO esto en Supabase -> SQL Editor -> Run.
-- ================================================================

-- 1) Quitar las políticas actuales del almacenamiento (solo hay bucket 'avatars').
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;
end $$;

-- 2) Lectura pública (las fotos de perfil se ven en la web).
create policy "avatars_public_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

-- 3) Subir SOLO a tu propia carpeta (primer nivel = tu user_id).
create policy "avatars_own_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4) Editar (sobrescribir) SOLO tu propia carpeta.
create policy "avatars_own_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5) Borrar SOLO tu propia carpeta.
create policy "avatars_own_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
