-- =============================================================================
-- 0024 · Inventory movements from POS sales
-- =============================================================================
-- Each order sent from the register consumes ingredients through the recipes
-- (receta_items, combos expanded to their products). Movements carry the
-- order they came from so the deduction is idempotent and reversible
-- (edit = delta, cancel = restore). A sale is a fact: it may push stock below
-- zero (the count was off) — only manual 'gasto' still refuses to go negative.
-- =============================================================================

alter table ingrediente_movements
  add column if not exists orden_id uuid references ordenes(id) on delete set null;
create index if not exists ingrediente_movements_orden_idx
  on ingrediente_movements(orden_id) where orden_id is not null;

create or replace function public.apply_ingrediente_movement()
returns trigger
language plpgsql
as $$
declare
  current_stock numeric(12, 3);
  ing_org       uuid;
  new_balance   numeric(12, 3);
begin
  select stock_current, organization_id
    into current_stock, ing_org
    from ingredientes
   where id = new.ingrediente_id
     for update;

  if current_stock is null then
    raise exception 'ingrediente_movements: ingrediente % not found', new.ingrediente_id;
  end if;
  if ing_org <> new.organization_id then
    raise exception 'ingrediente_movements: ingrediente does not belong to organization_id %', new.organization_id;
  end if;

  new_balance := current_stock + new.delta;
  -- 'venta' may go negative (POS sales are recorded even when the count is
  -- stale); a manual 'gasto' still can't spend what isn't there.
  if new_balance < 0 and new.type = 'gasto' then
    raise exception 'ingrediente_movements: insufficient stock (balance would be %)', new_balance;
  end if;

  update ingredientes
     set stock_current = new_balance
   where id = new.ingrediente_id;

  new.balance_after := new_balance;
  return new;
end;
$$;
