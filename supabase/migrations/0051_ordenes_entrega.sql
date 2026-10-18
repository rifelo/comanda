-- =============================================================================
-- 0051 · POS: entrega del pedido
-- =============================================================================
-- Cobrar y entregar son cosas distintas: un pedido pagado puede seguir en la
-- barra, y uno «pagar después» ya puede estar en la mesa. La caja marca cuándo
-- el pedido llegó al cliente para saber cuáles faltan por entregar.
--   · entregada_at  null = por entregar
--   · entregada_by  quién lo marcó (null en una caja vinculada sin sesión)
-- Los pedidos que ya existían se dan por entregados, para que la lista
-- «Por entregar» arranque vacía.
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table ordenes add column if not exists entregada_at timestamptz;
alter table ordenes add column if not exists entregada_by uuid references profiles(id) on delete set null;

update ordenes
   set entregada_at = coalesce(paid_at, created_at)
 where entregada_at is null
   and status <> 'cancelada'
   and created_at < now();

create index if not exists ordenes_por_entregar_idx
  on ordenes(organization_id, created_at)
  where entregada_at is null and status in ('pendiente', 'pagada');

notify pgrst, 'reload schema';
