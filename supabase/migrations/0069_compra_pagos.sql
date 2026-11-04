-- =============================================================================
-- 0069 · Pagos de los pedidos a proveedores (03-nov-2026)
-- =============================================================================
-- Lo que se le pagó a cada pedido (compras), venga de donde venga: el dueño
-- paga en línea con tarjeta o PSE, por transferencia o Nequi, con plata propia…
-- o la tablet lo paga con efectivo del cajón al recibir. Un pedido puede tener
-- varios pagos (anticipo + saldo); lo que debe = total de la factura (o el
-- estimado) − la suma de sus pagos.
--   · medio 'efectivo_caja' solo lo crea la recepción en la tablet, enlazado a
--     la salida de caja (caja_movimientos) para que el arqueo cuadre.
--   · compras.pago_metodo gana 'dueno': lo pagó el dueño fuera de la caja (en
--     línea, antes de que llegara, o después con «Registrar pago»).
-- Aditiva e idempotente.
-- =============================================================================
create table if not exists compra_pagos (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  compra_id          uuid not null references compras(id) on delete cascade,
  fecha              date not null,
  monto_cop          int not null check (monto_cop > 0),
  medio              text not null check (medio in ('tarjeta', 'transferencia', 'pse', 'nequi', 'efectivo', 'efectivo_caja', 'otro')),
  -- Número de orden, de aprobación o de la transferencia.
  referencia         text check (referencia is null or char_length(referencia) <= 80),
  note               text check (note is null or char_length(note) <= 300),
  caja_movimiento_id uuid references caja_movimientos(id) on delete set null,
  registered_by      uuid references profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists compra_pagos_compra_idx on compra_pagos(compra_id);
create index if not exists compra_pagos_org_fecha_idx on compra_pagos(organization_id, fecha desc);

alter table compra_pagos enable row level security;
drop policy if exists "compra pagos read org" on compra_pagos;
create policy "compra pagos read org" on compra_pagos for select
  using (organization_id = public.current_org());
drop policy if exists "compra pagos write admin" on compra_pagos;
create policy "compra pagos write admin" on compra_pagos for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

alter table compras drop constraint if exists compras_pago_metodo_check;
alter table compras add constraint compras_pago_metodo_check
  check (pago_metodo is null or pago_metodo in ('efectivo_caja', 'transferencia', 'pendiente', 'dueno'));

-- Lo que ya se registró al recibir (antes de esta tabla) pasa a ser un pago.
insert into compra_pagos (organization_id, compra_id, fecha, monto_cop, medio, caja_movimiento_id, registered_by, note, created_at)
select c.organization_id, c.id, (c.recibido_at at time zone 'America/Bogota')::date, c.factura_total_cop,
       c.pago_metodo, c.caja_movimiento_id, c.recibido_by, 'Registrado al recibir en la tablet', c.recibido_at
from compras c
where c.pago_metodo in ('efectivo_caja', 'transferencia')
  and c.factura_total_cop > 0
  and c.recibido_at is not null
  and not exists (select 1 from compra_pagos p where p.compra_id = c.id);

comment on table compra_pagos is 'Pagos de cada pedido a proveedor (en línea, transferencia, efectivo de la caja…); lo que debe = factura − pagos.';

notify pgrst, 'reload schema';
