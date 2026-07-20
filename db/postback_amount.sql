-- Importe del depósito en cada evento de FTD (para medir la calidad del tráfico:
-- depósito medio por afiliado). Se rellena solo si freshbet manda el importe en
-- el postback. Ejecútalo una vez en el editor SQL de Supabase. Idempotente.
alter table public.postback_events
  add column if not exists amount numeric;
