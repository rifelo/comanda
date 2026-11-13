-- Descuentos en el POS con aprobación del dueño.
--
-- The cashier asks for a discount on a saved (pending) order: a special unit
-- price for one product («Tinto a $2.000») or a percentage off the whole
-- order. The owner approves or rejects it from their phone. Once approved
-- the order's lines are re-priced (orden_items.unit_price_cop), so combining,
-- splitting by person, receipts and payments keep adding up the lines; an
-- edit of the order re-applies every approved discount of that order.
--
-- ordenes.subtotal_cop stays the list-price sum; total_cop is what is
-- charged; descuento_cop = subtotal − total.

create table if not exists orden_descuentos (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  orden_id          uuid not null references ordenes(id) on delete cascade,
  tipo              text not null check (tipo in ('precio', 'porcentaje')),
  producto_id       uuid references productos(id) on delete set null,
  producto_nombre   text,
  precio_cop        int check (precio_cop is null or precio_cop >= 0),
  porcentaje        numeric(5, 2) check (porcentaje is null or (porcentaje > 0 and porcentaje <= 100)),
  motivo            text not null check (length(trim(motivo)) > 0),
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'anulado')),
  total_antes_cop   int,
  total_despues_cop int,
  pedido_por        uuid references profiles(id) on delete set null,
  pedido_por_nombre text,
  pedido_at         timestamptz not null default now(),
  resuelto_por      uuid references profiles(id) on delete set null,
  resuelto_at       timestamptz,
  respuesta         text,
  check (
    (tipo = 'precio' and producto_id is not null and precio_cop is not null)
    or (tipo = 'porcentaje' and porcentaje is not null)
  )
);

create index if not exists orden_descuentos_orden_idx on orden_descuentos(orden_id);
create index if not exists orden_descuentos_org_estado_idx on orden_descuentos(organization_id, estado, pedido_at desc);

alter table orden_descuentos enable row level security;
drop policy if exists "orden_descuentos read org" on orden_descuentos;
create policy "orden_descuentos read org" on orden_descuentos for select
  using (organization_id = public.current_org());

alter table ordenes
  add column if not exists descuento_cop int not null default 0;

alter table organizations
  add column if not exists aprobaciones_whatsapp text;

comment on table orden_descuentos is
  'Descuentos pedidos desde el POS: precio especial de un producto o % a todo el pedido; el dueño los aprueba o rechaza.';
comment on column ordenes.descuento_cop is 'Descuentos aprobados del pedido: subtotal_cop − total_cop.';
comment on column organizations.aprobaciones_whatsapp is 'WhatsApp del dueño (con indicativo) al que el POS manda las solicitudes de descuento.';

notify pgrst, 'reload schema';
