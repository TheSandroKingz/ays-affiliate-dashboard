-- % de cada socio EN CADA GASTO de los afiliados. Salen por defecto del concepto,
-- pero se pueden cambiar gasto a gasto. Se guardan con el gasto para que, si entra
-- un socio nuevo o cambian los % del concepto, los gastos de antes no cambien.
-- reparto = [{"nombre":"Alan","pct":50},{"nombre":"Afrika","pct":50}]  (null = trabaja solo)
alter table gastos_afiliados add column if not exists reparto jsonb;
