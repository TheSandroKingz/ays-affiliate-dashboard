-- ============================================================================
-- VERIFICACIÓN (solo lectura) — ¿puede un afiliado auto-subirse el CPA o
-- aprobarse solo? La única barrera es un permiso de columna en la BD. Esta
-- consulta NO cambia nada; solo comprueba el estado. Pégala en el editor SQL de
-- Supabase y mira el resultado.
-- ============================================================================

-- 1) ¿El rol 'authenticated' (o 'anon') puede tocar columnas PELIGROSAS?
--    RESULTADO ESPERADO: 0 filas (vacío). Si aparece alguna columna aquí, un
--    afiliado PODRÍA escalar (aprobarse, subirse el CPA) → hay que arreglarlo.
select grantee, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'affiliates'
  and privilege_type = 'UPDATE'
  and grantee in ('authenticated', 'anon')
  and column_name in ('approved', 'active', 'cpa_spain', 'cpa_other',
                      'subaffiliate_percent', 'referred_by', 'promo_link');

-- 2) ¿Hay un permiso de UPDATE a NIVEL DE TABLA (que cubriría TODAS las columnas)?
--    RESULTADO ESPERADO: 0 filas. Si aparece 'authenticated' con UPDATE aquí,
--    el permiso por columna no está aplicado y SÍ puede escalar → arreglarlo.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'affiliates'
  and grantee in ('authenticated', 'anon')
  and privilege_type = 'UPDATE';

-- 3) Columnas que SÍ puede editar (para saber qué está permitido hoy).
--    Deberían ser solo de perfil (nombre, avatar, teléfono, wallets, birthdate…),
--    NUNCA approved/cpa_*/subaffiliate_percent.
select grantee, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'affiliates'
  and privilege_type = 'UPDATE'
  and grantee = 'authenticated'
order by column_name;
