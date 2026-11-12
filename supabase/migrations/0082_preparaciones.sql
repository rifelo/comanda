-- Preparaciones de la casa (crema chantilly, jarabe simple, cold foam…).
--
-- A preparación is an ingrediente with a yield (`rinde`, in its own unit) and
-- the ingredients one batch («tanda») takes (`preparacion_items`). Recipes and
-- modifiers use it like any other insumo. When the team makes a batch on the
-- tablet, `registrar_tanda` takes the ingredients out and puts the yield in,
-- in one transaction, and the preparación's cost becomes that batch's.

alter type ingrediente_movement_type add value if not exists 'preparacion';

alter table ingredientes
  add column if not exists rinde numeric(12, 3) check (rinde is null or rinde > 0);

comment on column ingredientes.rinde is
  'Preparación de la casa: cuánto sale de una tanda, en la unidad del insumo. Null = insumo comprado.';

create table if not exists preparacion_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  preparacion_id  uuid not null references ingredientes(id) on delete cascade,
  ingrediente_id  uuid not null references ingredientes(id) on delete restrict,
  qty             numeric(12, 3) not null check (qty > 0),
  position        smallint not null default 0,
  created_at      timestamptz not null default now(),
  unique (preparacion_id, ingrediente_id),
  check (preparacion_id <> ingrediente_id)
);
create index if not exists preparacion_items_prep_idx on preparacion_items(preparacion_id);
create index if not exists preparacion_items_ing_idx on preparacion_items(ingrediente_id);

create table if not exists preparacion_tandas (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id   uuid references restaurants(id) on delete set null,
  preparacion_id  uuid not null references ingredientes(id) on delete cascade,
  tandas          numeric(6, 2) not null check (tandas > 0),
  cantidad        numeric(12, 3) not null,
  costo_cop       numeric(12, 2) not null default 0,
  hecha_por       uuid references profiles(id) on delete set null,
  note            text check (note is null or char_length(note) <= 300),
  created_at      timestamptz not null default now()
);
create index if not exists preparacion_tandas_org_idx on preparacion_tandas(organization_id, created_at desc);

alter table ingrediente_movements
  add column if not exists tanda_id uuid references preparacion_tandas(id) on delete set null;

alter table preparacion_items enable row level security;
drop policy if exists "preparacion_items read org" on preparacion_items;
create policy "preparacion_items read org" on preparacion_items for select
  using (organization_id = public.current_org());
drop policy if exists "preparacion_items write admin" on preparacion_items;
create policy "preparacion_items write admin" on preparacion_items for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

alter table preparacion_tandas enable row level security;
drop policy if exists "preparacion_tandas read org" on preparacion_tandas;
create policy "preparacion_tandas read org" on preparacion_tandas for select
  using (organization_id = public.current_org());

-- One batch (or several) made: ingredients out, yield in, cost = this batch's.
create or replace function public.registrar_tanda(
  p_org uuid, p_prep uuid, p_tandas numeric, p_by uuid, p_restaurant uuid, p_note text
) returns uuid
language plpgsql
as $$
declare
  v_rinde   numeric;
  v_name    text;
  v_costo   numeric := 0;
  v_unit    numeric;
  v_tanda   uuid;
  v_note    text;
  r         record;
begin
  if p_tandas is null or p_tandas <= 0 or p_tandas > 50 then
    raise exception 'registrar_tanda: cantidad de tandas inválida';
  end if;
  select rinde, name into v_rinde, v_name
    from ingredientes
   where id = p_prep and organization_id = p_org and archived = false
   for update;
  if v_rinde is null then
    raise exception 'registrar_tanda: no es una preparación';
  end if;
  if not exists (select 1 from preparacion_items where preparacion_id = p_prep) then
    raise exception 'registrar_tanda: la preparación no tiene ingredientes';
  end if;

  select coalesce(sum(pi.qty * i.cost_cop), 0) into v_costo
    from preparacion_items pi join ingredientes i on i.id = pi.ingrediente_id
   where pi.preparacion_id = p_prep;
  v_unit := round(v_costo / v_rinde, 2);
  v_note := 'Preparación · '
    || replace(case when p_tandas = trunc(p_tandas) then trunc(p_tandas)::text else rtrim(p_tandas::text, '0') end, '.', ',')
    || case when p_tandas = 1 then ' tanda de ' else ' tandas de ' end || v_name;

  insert into preparacion_tandas (organization_id, restaurant_id, preparacion_id, tandas, cantidad, costo_cop, hecha_por, note)
  values (p_org, p_restaurant, p_prep, p_tandas, v_rinde * p_tandas, round(v_costo * p_tandas, 2), p_by, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_tanda;

  for r in
    select pi.ingrediente_id, pi.qty, i.cost_cop
      from preparacion_items pi join ingredientes i on i.id = pi.ingrediente_id
     where pi.preparacion_id = p_prep
     order by pi.position
  loop
    insert into ingrediente_movements (organization_id, ingrediente_id, type, delta, unit_cost_cop, note, created_by, tanda_id)
    values (p_org, r.ingrediente_id, 'preparacion', -(r.qty * p_tandas), r.cost_cop, v_note, p_by, v_tanda);
  end loop;

  insert into ingrediente_movements (organization_id, ingrediente_id, type, delta, unit_cost_cop, note, created_by, tanda_id)
  values (p_org, p_prep, 'preparacion', v_rinde * p_tandas, v_unit, v_note, p_by, v_tanda);

  update ingredientes set cost_cop = v_unit where id = p_prep;
  return v_tanda;
end;
$$;

notify pgrst, 'reload schema';
