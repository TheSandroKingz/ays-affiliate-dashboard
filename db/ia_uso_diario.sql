-- Resumen DIARIO del gasto de IA, para que el panel no tenga que traerse la tabla
-- entera. Medido el 17-sep: 2.455 filas del mes en 3 bloques (287 ms); al ritmo de
-- ahora, a fin de mes serían 24.000-30.000 filas y ~3 segundos cada vez que se abre
-- "Estado de los bots". Con esta vista son como mucho unos cientos de filas.
-- El día va en hora de Madrid, que es como se mira todo en el panel.
create or replace view ia_uso_diario as
select
  (created_at at time zone 'Europe/Madrid')::date as dia,
  coalesce(bot, 'as')                             as bot,
  tipo,
  count(*)            as llamadas,
  sum(entrada)        as entrada,
  sum(cache_lee)      as cache_lee,
  sum(cache_escribe)  as cache_escribe,
  sum(salida)         as salida
from ia_uso
group by 1, 2, 3;

-- Solo la aplicación (service role) entra aquí, igual que a ia_uso.
revoke all on ia_uso_diario from anon, authenticated;
