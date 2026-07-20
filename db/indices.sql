-- Índices para acelerar las consultas cuando el volumen crezca (muchos
-- afiliados / años de datos). Idempotente: si ya existen, no hace nada.
-- Ejecútalo una vez en el editor SQL de Supabase.

-- Búsquedas frecuentes sobre affiliates
create index if not exists idx_affiliates_referred_by
  on public.affiliates (referred_by);
create index if not exists idx_affiliates_approved
  on public.affiliates (approved);
create index if not exists idx_affiliates_afp
  on public.affiliates (freshaffs_affiliate_id);

-- Pagos por afiliado y por fecha (historial / saldos del mes)
create index if not exists idx_payments_user on public.payments (user_id);
create index if not exists idx_payments_date on public.payments (date);

-- Postbacks: búsqueda del tracking code SIN distinguir mayúsculas (ilike).
-- Un índice normal no sirve para ilike; trigram (pg_trgm) sí lo acelera.
create extension if not exists pg_trgm;
create index if not exists idx_affiliates_tracking_trgm
  on public.affiliates using gin (freshaffs_tracking_code gin_trgm_ops);

-- Nota: affiliate_daily_stats (user_id, date) y affiliates (user_id, id) ya
-- están indexados por sus claves primaria/única, así que no hace falta más ahí.
