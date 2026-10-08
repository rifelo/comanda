-- =============================================================================
-- 0047 · Compras: solicitudes del equipo, pedidos a proveedor y recepción
-- =============================================================================
-- El ciclo de compra, de punta a punta:
--   inventario_solicitudes  lo que el barista pide desde la tablet ("pedir algo
--                           más"): un ítem del inventario o texto libre.
--   compras                 el pedido a un proveedor: pedido → recibido →
--                           cerrada (o cancelada). `origen = 'directa'` es lo
--                           que el dueño compra en persona, sin pedido previo.
--   compra_items            cada línea: lo pedido, lo que llegó, lo que costó y
--                           cuándo vence (el lote).
-- Un proveedor tiene días fijos de pedido (`dias_pedido_idx`, lun = 0 … dom = 6)
-- y cuántos días tarda en entregar. Los movimientos `import` y los faltantes
-- apuntan a la compra que los atendió.
-- Cantidades siempre en la unidad de stock del ítem.
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table proveedores
  add column if not exists dias_pedido_idx smallint[] not null default '{}';
alter table proveedores
  add column if not exists entrega_dias smallint not null default 1 check (entrega_dias between 0 and 30);

create table if not exists compras (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  restaurant_id    uuid references restaurants(id) on delete set null,
  folio            int not null,
  proveedor_id     uuid references proveedores(id) on delete set null,
  status           text not null default 'pedido' check (status in ('pedido', 'recibido', 'cerrada', 'cancelada')),
  origen           text not null default 'pedido' check (origen in ('pedido', 'directa')),
  pedido_by        uuid references profiles(id) on delete set null,
  pedido_at        timestamptz not null default now(),
  entrega_esperada date,
  recibido_by      uuid references profiles(id) on delete set null,
  recibido_at      timestamptz,
  revisado_by      uuid references profiles(id) on delete set null,
  revisado_at      timestamptz,
  total_cop        numeric(12, 2),
  factura_url      text,
  note             text,
  created_at       timestamptz not null default now()
);
create unique index if not exists compras_org_folio_idx on compras(organization_id, folio);
create index if not exists compras_open_idx on compras(organization_id, status) where status in ('pedido', 'recibido');

create table if not exists compra_items (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  compra_id        uuid not null references compras(id) on delete cascade,
  -- Null = algo que no está en el inventario (jabón, un repuesto): va con `nombre`.
  ingrediente_id   uuid references ingredientes(id) on delete set null,
  nombre           text,
  qty_pedida       numeric(12, 3) not null default 0 check (qty_pedida >= 0),
  qty_recibida     numeric(12, 3) check (qty_recibida is null or qty_recibida >= 0),
  costo_total_cop  numeric(12, 2) check (costo_total_cop is null or costo_total_cop >= 0),
  vence_el         date,
  lote_estado      text not null default 'activo' check (lote_estado in ('activo', 'terminado', 'descartado')),
  note             text,
  created_at       timestamptz not null default now(),
  check (ingrediente_id is not null or nombre is not null)
);
create index if not exists compra_items_compra_idx on compra_items(compra_id);
create index if not exists compra_items_ingrediente_idx on compra_items(ingrediente_id);

create table if not exists inventario_solicitudes (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  restaurant_id     uuid references restaurants(id) on delete set null,
  shift_instance_id uuid references shift_instances(id) on delete set null,
  ingrediente_id    uuid references ingredientes(id) on delete cascade,
  nombre            text,
  qty               numeric(12, 3) check (qty is null or qty > 0),
  note              text,
  estado            text not null default 'abierta' check (estado in ('abierta', 'pedida', 'descartada')),
  compra_id         uuid references compras(id) on delete set null,
  requested_by      uuid references profiles(id) on delete set null,
  requested_at      timestamptz not null default now(),
  resolved_by       uuid references profiles(id) on delete set null,
  resolved_at       timestamptz,
  check (ingrediente_id is not null or nombre is not null)
);
create index if not exists inventario_solicitudes_open_idx
  on inventario_solicitudes(organization_id) where estado = 'abierta';

alter table ingrediente_movements
  add column if not exists compra_id uuid references compras(id) on delete set null;
alter table inventario_faltantes
  add column if not exists compra_id uuid references compras(id) on delete set null;

-- El equipo lee; el pedido y su revisión son del dueño. La tablet escribe con
-- service role (recepción, solicitudes), firmando con la persona que la usa.
alter table compras enable row level security;
drop policy if exists "compras read org" on compras;
create policy "compras read org" on compras for select
  using (organization_id = public.current_org());
drop policy if exists "compras write admin" on compras;
create policy "compras write admin" on compras for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

alter table compra_items enable row level security;
drop policy if exists "compra items read org" on compra_items;
create policy "compra items read org" on compra_items for select
  using (organization_id = public.current_org());
drop policy if exists "compra items write admin" on compra_items;
create policy "compra items write admin" on compra_items for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

alter table inventario_solicitudes enable row level security;
drop policy if exists "solicitudes read org" on inventario_solicitudes;
create policy "solicitudes read org" on inventario_solicitudes for select
  using (organization_id = public.current_org());
drop policy if exists "solicitudes insert org" on inventario_solicitudes;
create policy "solicitudes insert org" on inventario_solicitudes for insert
  with check (organization_id = public.current_org());
drop policy if exists "solicitudes update admin" on inventario_solicitudes;
create policy "solicitudes update admin" on inventario_solicitudes for update
  using (organization_id = public.current_org() and public.current_role() = 'admin');

notify pgrst, 'reload schema';
