-- ---------------------------------------------------------------------------
-- pagar_qftd: candado + pago del CPA en UNA SOLA operación atómica
-- ---------------------------------------------------------------------------
-- EL PROBLEMA QUE ARREGLA
-- Hasta ahora el cobro de un QFTD eran DOS pasos separados desde la aplicación:
--   1) reclamar el candado del jugador  (insert en postback_dedup)
--   2) sumar el CPA                     (increment_daily_stats)
-- Si el paso 2 fallaba (un hipo de la base de datos en la ráfaga que manda
-- Celsius cada 6 horas), el candado del paso 1 YA estaba puesto. A propósito NO
-- se soltaba, porque el fallo podía ser un "se guardó pero contestó tarde" y
-- soltarlo arriesgaba un doble pago. Consecuencia: cuando Celsius reintentaba un
-- minuto después, rebotaba contra el candado como "duplicado" y el CPA se perdía
-- EN SILENCIO. Pasó el 11-sep-2026 con 85 EUR.
--
-- CÓMO LO ARREGLA
-- Una función de Postgres es una sola transacción: o pasan las dos cosas, o no
-- pasa ninguna. Ya no existe el estado intermedio "candado puesto, dinero sin
-- sumar". Eso hace que REINTENTAR SEA SEGURO:
--   · si la primera llamada se guardó, la segunda devuelve false (ya pagado)
--   · si no se guardó, no dejó candado y la segunda paga con normalidad
-- Y da igual que la respuesta se pierda por el camino: el reintento nunca paga
-- dos veces ni deja dinero sin contar.
--
-- DEVUELVE
--   true  -> se ha pagado AHORA
--   false -> ese jugador ya estaba pagado (no se toca nada)
--
-- Es idempotente. Llamarla 10 veces con la misma clave paga UNA vez.
create or replace function public.pagar_qftd(
  p_key        text,
  p_user_id    uuid,
  p_date       date,
  p_commission numeric
) returns boolean
language plpgsql
as $$
declare
  v_filas integer;
begin
  -- El candado por jugador. Si ya existía, no insertamos nada.
  insert into public.postback_dedup (event_key)
  values (p_key)
  on conflict (event_key) do nothing;

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return false;  -- ya estaba pagado
  end if;

  -- Misma transacción que el candado: o las dos, o ninguna.
  -- ⚠️ Los parámetros van POR NOMBRE, no por orden. Por orden falla (error
  -- 42883): la función de la base de datos no tiene exactamente esa firma, y
  -- además así da igual si algún día se le añade un parámetro nuevo.
  perform public.increment_daily_stats(
    p_user_id       => p_user_id,
    p_date          => p_date,
    p_registrations => 0,
    p_ftd           => 1,
    p_commission    => p_commission
  );
  return true;
end;
$$;

-- Solo la aplicación (service role) la usa; nadie más debe poder llamarla.
revoke all on function public.pagar_qftd(text, uuid, date, numeric) from public;
revoke all on function public.pagar_qftd(text, uuid, date, numeric) from anon;
revoke all on function public.pagar_qftd(text, uuid, date, numeric) from authenticated;
