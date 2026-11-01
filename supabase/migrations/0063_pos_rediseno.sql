-- POS rediseño (canvas «Comanda POS», 31-oct-2026).
--
-- · Datáfono replaces «tarjeta» as a payment method (record-only: the POS
--   does not talk to Bold). Old rows are renamed; it stays out of the cash
--   in the arqueo, as tarjeta did.
-- · orden_pagos.aprobacion: optional approval number from the Bold voucher.
-- · ordenes.se_lo_llevamos: the barista chose to bring it to the customer
--   (self-service café: no tables, orders go by name).
-- · ordenes.por_verificar: «Aún no llega · pagar después» on the transfer
--   screen — the order is prepared and waits in Pedidos as «Transferencia
--   por verificar».
-- · productos.recomendacion: what the barista says to upsell this product
--   («Dilo así» on the options page).
-- · organizations: transfer key / holder and Bold settlement delay, shown on
--   the payment pages when set.

alter table ordenes add column if not exists se_lo_llevamos boolean not null default false;
alter table ordenes add column if not exists por_verificar text
  check (por_verificar in ('transferencia'));
alter table orden_pagos add column if not exists aprobacion text
  check (char_length(aprobacion) <= 40);
alter table productos add column if not exists recomendacion text
  check (char_length(recomendacion) <= 300);
alter table organizations add column if not exists transferencia_llave text
  check (char_length(transferencia_llave) <= 80);
alter table organizations add column if not exists transferencia_titular text
  check (char_length(transferencia_titular) <= 80);
alter table organizations add column if not exists datafono_liquidacion text
  check (char_length(datafono_liquidacion) <= 60);

-- tarjeta → datafono on both tables (drop whatever check mentions the column first).
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as t, conname from pg_constraint
    where contype = 'c'
      and ((conrelid = 'public.ordenes'::regclass and pg_get_constraintdef(oid) like '%payment_method%')
        or (conrelid = 'public.orden_pagos'::regclass and pg_get_constraintdef(oid) like '%method%'
            and pg_get_constraintdef(oid) like '%transferencia%'))
  loop
    execute format('alter table %s drop constraint %I', c.t, c.conname);
  end loop;
end $$;

update ordenes set payment_method = 'datafono' where payment_method = 'tarjeta';
update orden_pagos set method = 'datafono' where method = 'tarjeta';

alter table ordenes add constraint ordenes_payment_method_check
  check (payment_method in ('efectivo', 'datafono', 'transferencia', 'mixto'));
alter table orden_pagos add constraint orden_pagos_method_check
  check (method in ('efectivo', 'datafono', 'transferencia'));

comment on column ordenes.se_lo_llevamos is 'El barista se lo lleva al cliente (autoservicio: sin mesas).';
comment on column ordenes.por_verificar is 'transferencia = se envió sin confirmar que llegó la transferencia.';
comment on column orden_pagos.aprobacion is 'Número de aprobación del voucher del datáfono (opcional).';
comment on column productos.recomendacion is 'Guion de venta sugestiva para el POS («Dilo así»).';
