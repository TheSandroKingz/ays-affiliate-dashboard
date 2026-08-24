-- ⚙️ Recupera el IMPORTE (amount) de los depósitos históricos. Blue SIEMPRE lo mandó
-- (viene dentro del raw_query como "amount=20"), pero un bug lo tiraba al guardar.
-- Ya está arreglado el bug (los nuevos se guardan bien); esto rellena los VIEJOS.
-- Solo toca filas con amount vacío. No cambia nada más. Idempotente (se puede repetir).
update postback_events
set amount = replace(substring(raw_query from 'amount=([0-9][0-9.,]*)'), ',', '.')::numeric
where amount is null
  and raw_query ~ 'amount=[0-9]';

-- Comprobación: cuántos depósitos (ftd) tienen ya importe y su media.
select count(*) filter (where amount is not null and amount > 0) as con_importe,
       round(avg(amount) filter (where amount is not null and amount > 0), 2) as media_ftd
from postback_events
where event_type = 'ftd';
