-- =============================================================================
-- 0022 · Órdenes pendientes de pago ("enviar · pagar después")
-- =============================================================================
-- Customers sit, get served and pay afterwards, so an order can now live
-- unpaid for a while. `status` becomes:
--   · 'pendiente' — sent to the kitchen, not yet paid (payment_* null)
--   · 'pagada'    — settled (payment_method / tendered_cop / change_cop set)
--   · 'cancelada' — voided before payment
-- Legacy 'enviada' rows were all paid at creation (pay-now was the only flow),
-- so they become 'pagada' with paid_at = created_at. RLS unchanged: ordenes /
-- orden_items stay org-member read+write (0019).
-- =============================================================================

alter table ordenes add column if not exists paid_at timestamptz;

-- The check must go before the data update or the update itself fails.
alter table ordenes drop constraint if exists ordenes_status_check;
update ordenes set status = 'pagada' where status = 'enviada';
update ordenes set paid_at = created_at where status = 'pagada' and paid_at is null;
alter table ordenes
  add constraint ordenes_status_check
  check (status in ('pendiente', 'pagada', 'cancelada'));
alter table ordenes alter column status set default 'pagada';

-- The POS lists open orders per org, oldest first.
create index if not exists ordenes_org_status_created_idx
  on ordenes(organization_id, status, created_at desc);
