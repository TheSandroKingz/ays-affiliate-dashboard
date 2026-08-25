-- Columna para saber a quién ya se le envió el mensaje diario HOY, y así poder
-- REANUDAR el envío si la función se corta a mitad (en vez de saltar a media lista).
-- El código ya funciona sin ella (cae al comportamiento antiguo: envía a todos);
-- con la columna, un reintento continúa por los que faltan. Idempotente.
alter table public.telegram_contacts
  add column if not exists last_daily_at date;
