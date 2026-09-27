-- =============================================================================
-- 0040 · A staff sale moves the inventory too
--
-- `apply_ingrediente_movement()` (0007, relaxed for POS sales in 0024) locks
-- and updates the `ingredientes` row from inside the BEFORE INSERT trigger on
-- `ingrediente_movements`. It ran with the caller's privileges, and
-- `ingredientes` is admin-write: for a staff member the `select … for update`
-- saw no row (FOR UPDATE applies the UPDATE policies), the trigger raised
-- "ingrediente … not found", and the movement was refused — although the
-- "ingrediente_movements staff insert" policy says staff may insert.
--
-- It never showed because every sale so far came from the admin account or a
-- paired device (service role). With the staff home, the team opens the
-- register with their own accounts: the sale was recorded, the stock was not.
--
-- The function now runs as its owner. What a caller may insert is still
-- decided by the policies on `ingrediente_movements` (own org only), and the
-- function itself refuses an ingrediente from another organization.
-- =============================================================================

create or replace function public.apply_ingrediente_movement()
returns trigger
language plpgsql
security definer
set search_path = public
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
