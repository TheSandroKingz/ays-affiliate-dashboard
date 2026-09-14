-- ---------------------------------------------------------------------------
-- pagar_qftd v2: que el candado RECUERDE que ya pagó
-- ---------------------------------------------------------------------------
-- EL PROBLEMA QUE QUEDABA
-- La v1 ya metía candado y pago en una sola transacción, así que reintentar era
-- seguro. Pero devolvía solo true/false, y "false" significa dos cosas muy
-- distintas:
--   (a) ya se pagó antes  -> el dinero ESTÁ
--   (b) candado huérfano  -> el dinero NO está
-- Sin poder distinguirlas, la aplicación apuntaba el evento como "retenido" y
-- saltaba una alarma de doble pago... mientras el dinero sí se había sumado.
-- Resultado: los eventos no cuadraban con la tabla de comisiones (85 EUR el
-- 13-sep, 85 + 50 EUR el 14-sep) y avisos falsos al móvil.
--
-- LA SOLUCIÓN
-- El candado guarda QUIÉN, CUÁNDO y CUÁNTO se pagó. Así, cuando llega un
-- reintento, se puede contestar "ya estaba pagado, y esto es lo que se pagó",
-- y la aplicación apunta el evento como contado en vez de inventarse una
-- alarma.
alter table public.postback_dedup
  add column if not exists pagado_user       uuid,
  add column if not exists pagado_date       date,
  add column if not exists pagado_commission numeric;

-- Devuelve un objeto:
--   {"pagado": true,  "ya_estaba": false, ...}  -> se ha pagado AHORA
--   {"pagado": true,  "ya_estaba": true,  ...}  -> ya estaba pagado (el dinero ESTÁ)
--   {"pagado": false, "ya_estaba": true,  ...}  -> candado huérfano, el dinero NO está
create or replace function public.pagar_qftd(
  p_key        text,
  p_user_id    uuid,
  p_date       date,
  p_commission numeric
) returns jsonb
language plpgsql
as $$
declare
  v_filas integer;
  v_user  uuid;
  v_date  date;
  v_com   numeric;
begin
  insert into public.postback_dedup (event_key, pagado_user, pagado_date, pagado_commission)
  values (p_key, p_user_id, p_date, p_commission)
  on conflict (event_key) do nothing;

  get diagnostics v_filas = row_count;

  if v_filas > 0 then
    -- Candado cogido: se paga AHORA, en la misma transacción.
    perform public.increment_daily_stats(
      p_user_id       => p_user_id,
      p_date          => p_date,
      p_registrations => 0,
      p_ftd           => 1,
      p_commission    => p_commission
    );
    return jsonb_build_object('pagado', true, 'ya_estaba', false,
                              'user', p_user_id, 'date', p_date, 'commission', p_commission);
  end if;

  -- El candado ya estaba. ¿Lo puso un pago de verdad o es huérfano del método
  -- viejo (que ponía el candado y luego fallaba al sumar)?
  select pagado_user, pagado_date, pagado_commission
    into v_user, v_date, v_com
    from public.postback_dedup where event_key = p_key;

  if v_user is null then
    return jsonb_build_object('pagado', false, 'ya_estaba', true);  -- huérfano
  end if;

  return jsonb_build_object('pagado', true, 'ya_estaba', true,
                            'user', v_user, 'date', v_date, 'commission', v_com);
end;
$$;

revoke all on function public.pagar_qftd(text, uuid, date, numeric) from public;
revoke all on function public.pagar_qftd(text, uuid, date, numeric) from anon;
revoke all on function public.pagar_qftd(text, uuid, date, numeric) from authenticated;
