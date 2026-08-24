-- iAfrika: fijar su tracking code y su enlace promocional.
-- freshaffs_tracking_code = werECqYvPP  → link "Registro" que usa ella por privado
--   (así el postback de Blue le atribuye el dinero, y /go/werECqYvPP cuenta clicks).
-- promo_link = destino celsius al que redirige /go (cuenta el click y reenvía).
-- El enlace del BOT (naIRiroIcA) NO va aquí: ya está mapeado en blue/route.ts.
update affiliates
set freshaffs_tracking_code = 'werECqYvPP',
    promo_link = 'https://celsius.games/werECqYvPP'
where user_id = '38d176ce-d8c6-435f-a4df-85e1a62bdcef';

-- Comprobación:
select user_id, freshaffs_tracking_code, promo_link
from affiliates
where user_id = '38d176ce-d8c6-435f-a4df-85e1a62bdcef';
