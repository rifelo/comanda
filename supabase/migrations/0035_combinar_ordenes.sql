-- =============================================================================
-- 0035 · Combinar pedidos pendientes
-- =============================================================================
-- Una mesa que quedó partida en varios pedidos se junta en uno: las líneas y
-- los pagos de las fuentes pasan al destino, el roster se une, los totales
-- se recalculan y las fuentes quedan `cancelada` apuntando al destino con
-- `merged_into`. Todo dentro de una función para que nunca queden líneas a
-- medio mover. Los reportes ya excluyen 'cancelada', así que el total del
-- día no cambia.
-- Idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table ordenes add column if not exists merged_into uuid references ordenes(id) on delete set null;
create index if not exists ordenes_merged_into_idx on ordenes(merged_into) where merged_into is not null;
comment on column ordenes.merged_into is 'Pedido en el que se combinó este (queda cancelada).';

create or replace function public.combinar_ordenes(p_org uuid, p_target uuid, p_sources uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target   ordenes%rowtype;
  v_src      ordenes%rowtype;
  v_id       uuid;
  v_name     text;
  v_pos      int;
  v_names    text[];
  v_notes    text;
  v_gluten   boolean;
  v_subtotal int;
  v_paid     int;
  v_tendered int;
  v_change   int;
  v_methods  text[];
  v_method   text;
begin
  if p_sources is null or array_length(p_sources, 1) is null then
    raise exception 'Elige al menos un pedido para combinar.';
  end if;
  if p_target = any(p_sources) then
    raise exception 'El destino no puede estar entre las fuentes.';
  end if;

  select * into v_target from ordenes
    where id = p_target and organization_id = p_org and status = 'pendiente'
    for update;
  if not found then
    raise exception 'El pedido destino ya no está pendiente.';
  end if;

  v_names  := coalesce(v_target.customer_names, '{}');
  v_notes  := coalesce(v_target.notes, '');
  v_gluten := v_target.sin_gluten;

  foreach v_id in array p_sources loop
    select * into v_src from ordenes
      where id = v_id and organization_id = p_org and status = 'pendiente'
      for update;
    if not found then
      raise exception 'Un pedido a combinar ya no está pendiente.';
    end if;

    -- Lines go behind the target's, keeping their own order.
    select coalesce(max(position), -1) into v_pos from orden_items where orden_id = p_target;
    update orden_items set orden_id = p_target, position = position + v_pos + 1 where orden_id = v_id;
    update orden_pagos set orden_id = p_target where orden_id = v_id;

    -- Roster: target first, then each source's names not already there.
    foreach v_name in array coalesce(v_src.customer_names, '{}') loop
      if not exists (select 1 from unnest(v_names) x where lower(x) = lower(v_name)) then
        v_names := v_names || v_name;
      end if;
    end loop;
    if coalesce(v_src.notes, '') <> '' then
      v_notes := case when v_notes = '' then v_src.notes else v_notes || ' · ' || v_src.notes end;
    end if;
    v_gluten := v_gluten or v_src.sin_gluten;

    update ordenes
      set status = 'cancelada',
          merged_into = p_target,
          notes = case when coalesce(notes, '') = '' then 'Combinado en ' || v_target.folio
                       else notes || ' · Combinado en ' || v_target.folio end
      where id = v_id;
  end loop;

  select coalesce(sum(qty * unit_price_cop), 0) into v_subtotal from orden_items where orden_id = p_target;
  select coalesce(sum(amount_cop), 0), coalesce(sum(tendered_cop), 0), coalesce(sum(change_cop), 0), array_agg(distinct method)
    into v_paid, v_tendered, v_change, v_methods
    from orden_pagos where orden_id = p_target;
  v_method := case when v_methods is null then null
                   when array_length(v_methods, 1) = 1 then v_methods[1]
                   else 'mixto' end;

  update ordenes
    set subtotal_cop   = v_subtotal,
        total_cop      = v_subtotal,
        customer_names = v_names,
        notes          = nullif(v_notes, ''),
        sin_gluten     = v_gluten,
        paid_cop       = v_paid,
        payment_method = v_method,
        tendered_cop   = case when v_tendered > 0 then v_tendered else null end,
        change_cop     = v_change
    where id = p_target;

  return p_target;
end;
$$;

grant execute on function public.combinar_ordenes(uuid, uuid, uuid[]) to authenticated;
