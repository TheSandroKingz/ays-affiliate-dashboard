-- ================================================================
--  SEGURIDAD del almacenamiento de fotos (bucket 'avatars').
--  Las políticas existentes se llaman "Subir avatar" (INSERT),
--  "Actualizar avatar" (UPDATE) y "Avatar publico" (SELECT).
--  Modificamos las de escritura para que cada afiliado solo pueda
--  subir/editar EN SU PROPIA carpeta (primer nivel = su user_id).
--  La lectura pública se deja igual (las fotos se ven en la web).
--  Ejecuta TODO esto en Supabase -> SQL Editor -> Run.
-- ================================================================

alter policy "Subir avatar" on storage.objects
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

alter policy "Actualizar avatar" on storage.objects
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
