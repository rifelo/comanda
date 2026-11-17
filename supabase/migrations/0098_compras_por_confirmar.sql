-- Supplier orders armed from «Por pedir» no longer count as placed the moment
-- the WhatsApp opens: they wait as «borrador» (por confirmar) until the owner
-- marks them as solicitado with the expected delivery date, the total and how
-- it will be paid. `pago_previsto` tells the tablet what to pick on reception.

alter table compras drop constraint if exists compras_status_check;
alter table compras add constraint compras_status_check
  check (status in ('borrador', 'pedido', 'recibido', 'cerrada', 'cancelada'));

alter table compras add column if not exists pago_previsto text
  check (pago_previsto in ('caja', 'transferencia'));

comment on column compras.pago_previsto is
  'Set when the owner confirms the order: caja = the tablet pays it from the drawer on reception; transferencia = the owner paid it (a compra_pagos row).';
