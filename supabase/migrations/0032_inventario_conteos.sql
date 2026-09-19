-- =============================================================================
-- 0032 · Conteo de inventario al cierre del turno
-- =============================================================================
-- El equipo cuenta el stock físico en el tablet (a ciegas: sin ver lo que el
-- sistema espera), el conteo queda guardado con la foto del stock esperado en
-- ese instante y el dueño lo aprueba desde el panel; aprobar genera los
-- movimientos de ajuste. `ingredientes.conteo_diario` marca la lista corta
-- que se cuenta cada cierre; el conteo completo es semanal.
-- Idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table ingredientes add column if not exists conteo_diario boolean not null default false;

create table if not exists inventario_conteos (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  restaurant_id     uuid references restaurants(id) on delete set null,
  shift_instance_id uuid references shift_instances(id) on delete set null,
  kind              text not null check (kind in ('diario', 'completo')),
  status            text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado')),
  counted_by        uuid references profiles(id) on delete set null,
  submitted_at      timestamptz not null default now(),
  reviewed_by       uuid references profiles(id) on delete set null,
  reviewed_at       timestamptz,
  note              text,
  review_note       text
);
create index if not exists inventario_conteos_org_idx on inventario_conteos(organization_id, submitted_at desc);

create table if not exists inventario_conteo_items (
  id             uuid primary key default uuid_generate_v4(),
  conteo_id      uuid not null references inventario_conteos(id) on delete cascade,
  ingrediente_id uuid not null references ingredientes(id) on delete cascade,
  expected       numeric(12, 3) not null,   -- stock_current when the count was submitted
  counted        numeric(12, 3) not null,
  unit_cost_cop  int not null default 0,    -- cost snapshot, values the variance
  note           text,
  unique (conteo_id, ingrediente_id)
);
create index if not exists inventario_conteo_items_conteo_idx on inventario_conteo_items(conteo_id);

alter table inventario_conteos enable row level security;
alter table inventario_conteo_items enable row level security;

drop policy if exists "conteos read org" on inventario_conteos;
create policy "conteos read org" on inventario_conteos for select
  using (organization_id = public.current_org());
drop policy if exists "conteos insert org" on inventario_conteos;
create policy "conteos insert org" on inventario_conteos for insert
  with check (organization_id = public.current_org());
drop policy if exists "conteos admin update" on inventario_conteos;
create policy "conteos admin update" on inventario_conteos for update
  using (public.current_role() = 'admin' and organization_id = public.current_org())
  with check (public.current_role() = 'admin' and organization_id = public.current_org());

drop policy if exists "conteo items read org" on inventario_conteo_items;
create policy "conteo items read org" on inventario_conteo_items for select
  using (exists (select 1 from inventario_conteos c where c.id = conteo_id and c.organization_id = public.current_org()));
drop policy if exists "conteo items insert org" on inventario_conteo_items;
create policy "conteo items insert org" on inventario_conteo_items for insert
  with check (exists (select 1 from inventario_conteos c where c.id = conteo_id and c.organization_id = public.current_org()));

comment on column ingredientes.conteo_diario is 'Entra en la lista corta que se cuenta en cada cierre de turno.';
comment on table inventario_conteos is 'Conteos físicos del equipo; aprobarlos genera movimientos de ajuste.';
