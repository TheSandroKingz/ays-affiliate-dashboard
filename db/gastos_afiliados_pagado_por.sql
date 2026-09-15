-- Quién hizo cada gasto: hay afiliados que trabajan en equipo. Nombre libre.
alter table gastos_afiliados add column if not exists pagado_por text;
