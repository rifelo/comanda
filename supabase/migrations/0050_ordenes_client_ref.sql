-- =============================================================================
-- 0050 · POS sin conexión: referencia del cliente por pedido
-- =============================================================================
-- El POS guarda los pedidos en una cola local cuando no hay internet y los
-- envía al volver la conexión. Si una respuesta se pierde en el camino, el
-- reintento no debe crear un segundo pedido: cada pedido nace en la caja con
-- `client_ref` y el servidor devuelve el existente cuando ya lo recibió.
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table ordenes add column if not exists client_ref text;
create unique index if not exists ordenes_org_client_ref_uidx
  on ordenes(organization_id, client_ref) where client_ref is not null;
