-- Marca la última vez que cada dispositivo dio señales de vida.
-- Sirve para borrar las suscripciones FANTASMA: iPhone rota el endpoint y deja
-- el viejo colgado; Apple lo sigue aceptando (201) aunque no lo entregue a
-- nadie, así que parece que el aviso salió cuando en realidad no llegó.
alter table push_subscriptions
  add column if not exists last_seen_at timestamptz default now();

-- Las que ya existen arrancan con su fecha de creación.
update push_subscriptions
   set last_seen_at = created_at
 where last_seen_at is null;
