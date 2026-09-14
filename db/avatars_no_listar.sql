-- El bucket "avatars" es PÚBLICO a propósito: el dashboard carga las fotos de
-- perfil por URL pública. Eso está bien y no se toca.
-- El problema es otro: sin iniciar sesión se puede pedir el LISTADO del bucket
-- y salen los nombres de los archivos, que son los UUID de los usuarios.
--
-- Esto quita solo el permiso de LISTAR. Las fotos se siguen viendo igual.

-- 1) Ver qué permisos hay ahora mismo sobre el bucket (informativo).
select policyname, cmd, roles, qual
  from pg_policies
 where schemaname = 'storage'
   and tablename  = 'objects'
   and (qual::text like '%avatars%' or with_check::text like '%avatars%');

-- 2) Borrar los permisos de LECTURA/LISTADO sobre "avatars".
--    Solo toca los de tipo SELECT: subir y cambiar la foto sigue funcionando.
do $$
declare p record;
begin
  for p in
    select policyname
      from pg_policies
     where schemaname = 'storage'
       and tablename  = 'objects'
       and cmd = 'SELECT'
       and qual::text like '%avatars%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
    raise notice 'Quitado: %', p.policyname;
  end loop;
end $$;
