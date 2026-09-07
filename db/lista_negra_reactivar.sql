-- Sacar a un jugador de la LISTA NEGRA (Prompt Maestro, bloque 5: solo Yaiza
-- decide reactivarlo). No borramos la fila: la marcamos como reactivada, así
-- queda el rastro de quién lo hizo y cuándo por si hay que revisarlo después.
alter table public.lista_negra
  add column if not exists reactivado_at  timestamptz,
  add column if not exists reactivado_por text;

-- El informe solo muestra los que siguen bloqueados (reactivado_at is null).
create index if not exists idx_lista_negra_activos
  on public.lista_negra (created_at desc)
  where reactivado_at is null;
