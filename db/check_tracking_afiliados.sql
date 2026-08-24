-- ✅ SOLO MIRA (no cambia nada). Lista los afiliados a los que les FALTA el
-- "código" (freshaffs_tracking_code) o el enlace (promo_link). Si a alguno le
-- falta, cuando su gente deposite el dinero NO se le atribuye a él (cae a la casa).
-- Lo ideal: que esta consulta salga VACÍA (todos tienen su código puesto).
select
  user_id,
  display_name,
  freshaffs_tracking_code,
  promo_link
from affiliates
where approved = true                              -- solo los afiliados activos
  and (freshaffs_tracking_code is null
       or trim(freshaffs_tracking_code) = ''
       or promo_link is null
       or trim(promo_link) = '')
order by display_name;
