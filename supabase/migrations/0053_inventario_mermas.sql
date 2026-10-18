-- =============================================================================
-- 0053 · Inventario: mermas
-- =============================================================================
-- Lo que se pierde sin venderse: una bebida que se cayó, un postre que se dañó,
-- una bolsa de leche vencida. El barista la registra desde la tablet con su
-- justificación; el inventario baja con movimientos de tipo «merma» (aparte de
-- ventas y ajustes) y el dueño ve el costo perdido.
--   · producto_id    una bebida o producto: baja toda su receta × qty
--   · ingrediente_id un insumo suelto: baja qty en su unidad
--   · nombre/unidad  copia al momento, por si el ítem cambia o se archiva
--   · costo_cop      lo que costaba lo perdido (recetas e insumos a su costo)
-- Como las ventas, una merma puede dejar el stock en negativo: el conteo lo
-- corrige después. La tablet escribe con el rol de servicio.
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter type ingrediente_movement_type add value if not exists 'merma';

create table if not exists inventario_mermas (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  restaurant_id     uuid references restaurants(id) on delete set null,
  shift_instance_id uuid references shift_instances(id) on delete set null,
  producto_id       uuid references productos(id) on delete set null,
  ingrediente_id    uuid references ingredientes(id) on delete set null,
  nombre            text not null,
  qty               numeric(12, 3) not null check (qty > 0),
  unidad            text not null,
  motivo            text not null check (motivo in ('se_cayo', 'danado', 'vencido', 'mal_preparado', 'otro')),
  justificacion     text not null check (char_length(btrim(justificacion)) >= 5),
  costo_cop         numeric(12, 2) not null default 0,
  reported_by       uuid references profiles(id) on delete set null,
  reported_at       timestamptz not null default now()
);
create index if not exists inventario_mermas_org_fecha_idx on inventario_mermas(organization_id, reported_at desc);

alter table ingrediente_movements
  add column if not exists merma_id uuid references inventario_mermas(id) on delete set null;

alter table inventario_mermas enable row level security;
drop policy if exists "mermas read org" on inventario_mermas;
create policy "mermas read org" on inventario_mermas for select
  using (organization_id = public.current_org());
drop policy if exists "mermas write admin" on inventario_mermas;
create policy "mermas write admin" on inventario_mermas for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

notify pgrst, 'reload schema';
