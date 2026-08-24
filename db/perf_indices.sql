-- ⚡ Índices para acelerar el dashboard. SOLO MIRA/ACELERA: no cambian ni un dato
-- ni un número (las comisiones, QFTD y márgenes salen idénticos). Son idempotentes
-- (se pueden correr varias veces sin problema). Correr una vez en Supabase.

-- 1) EL GRANDE: casi todas las pantallas de dinero filtran postback_events por
--    'afp' (panel de bots, mi-bot, bot-money). Sin este índice, cada carga escanea
--    la tabla entera. Cubre afp + event_type + fecha.
create index if not exists idx_postback_events_afp_type_created
  on public.postback_events (afp, event_type, created_at desc);

-- 2) Panel del afiliado (mi-bot): filtra por afp y ordena por fecha.
create index if not exists idx_postback_events_afp_created
  on public.postback_events (afp, created_at desc);

-- 3) Chequeos por fecha en las estadísticas diarias (salud / detección de fraude).
create index if not exists idx_daily_date
  on public.affiliate_daily_stats (date);
