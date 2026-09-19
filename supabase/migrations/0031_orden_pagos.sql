-- =============================================================================
-- 0031 · Órdenes — varios pagos por pedido (dividir la cuenta por persona)
-- =============================================================================
-- Una mesa paga por persona sin partir el pedido: un folio, varios pagos.
-- `orden_pagos` guarda cada cobro (con la persona a la que corresponde, o
-- null para "la mesa"); `ordenes.paid_cop` cachea la suma para que las
-- tarjetas de Pedidos muestren «falta $X» sin otra consulta. `payment_method`
-- pasa a ser un resumen: el método único si todos coinciden, 'mixto' si no.
-- `status` sigue 'pendiente' hasta que paid_cop >= total_cop.
-- Idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create table if not exists orden_pagos (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  orden_id        uuid not null references ordenes(id) on delete cascade,
  customer_name   text,                                   -- null = pago de la mesa
  method          text not null check (method in ('efectivo', 'tarjeta', 'transferencia')),
  amount_cop      int  not null check (amount_cop > 0),
  tendered_cop    int  check (tendered_cop >= 0),         -- efectivo recibido
  change_cop      int  not null default 0 check (change_cop >= 0),
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists orden_pagos_orden_idx on orden_pagos(orden_id, created_at);
create index if not exists orden_pagos_org_idx   on orden_pagos(organization_id);

alter table orden_pagos enable row level security;
drop policy if exists "orden_pagos read org" on orden_pagos;
create policy "orden_pagos read org" on orden_pagos for select
  using (organization_id = public.current_org());
drop policy if exists "orden_pagos write org" on orden_pagos;
create policy "orden_pagos write org" on orden_pagos for all
  using (organization_id = public.current_org())
  with check (organization_id = public.current_org());

alter table ordenes add column if not exists paid_cop int not null default 0 check (paid_cop >= 0);

-- The inline check from 0021 got an auto name; drop whatever check mentions the column.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.ordenes'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%payment_method%'
  loop
    execute format('alter table ordenes drop constraint %I', c.conname);
  end loop;
end $$;
alter table ordenes add constraint ordenes_payment_method_check
  check (payment_method in ('efectivo', 'tarjeta', 'transferencia', 'mixto'));

-- Orders already paid were paid in full.
update ordenes set paid_cop = total_cop where status = 'pagada' and paid_cop = 0;

comment on table  orden_pagos          is 'Cobros de un pedido; varios cuando la mesa paga por persona.';
comment on column ordenes.paid_cop     is 'Suma cacheada de orden_pagos.amount_cop.';
comment on column ordenes.payment_method is 'Resumen de los pagos: el método único, o mixto.';
