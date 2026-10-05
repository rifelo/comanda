-- =============================================================================
-- 0045 · Conteo: ítems propuestos desde la tablet
-- =============================================================================
-- Al contar aparecen cosas que nadie cargó en el inventario. El barista no
-- crea ítems (se llenaría de duplicados y de ítems sin costo ni unidad): los
-- propone con el conteo — nombre, cuánto hay y en qué viene — y el dueño
-- decide por cada uno: crearlo, unirlo a uno que ya existe o descartarlo.
-- Una propuesta no toca el inventario hasta que se resuelve.
-- Aditiva e idempotente.
-- =============================================================================
create table if not exists inventario_conteo_propuestas (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conteo_id       uuid not null references inventario_conteos(id) on delete cascade,
  name            text not null,
  qty             numeric(12, 3) not null check (qty >= 0),
  -- Como lo dijo quien contó: "und", "bolsa", "caja"… (no es la unidad de stock).
  unit            text not null,
  note            text,
  status          text not null default 'pendiente' check (status in ('pendiente', 'creado', 'unido', 'descartado')),
  -- El ítem que resultó: el creado o aquel al que se unió.
  ingrediente_id  uuid references ingredientes(id) on delete set null,
  resolved_by     uuid references profiles(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists conteo_propuestas_conteo_idx on inventario_conteo_propuestas(conteo_id);
create index if not exists conteo_propuestas_open_idx
  on inventario_conteo_propuestas(organization_id) where status = 'pendiente';

alter table inventario_conteo_propuestas enable row level security;
drop policy if exists "conteo propuestas read org" on inventario_conteo_propuestas;
create policy "conteo propuestas read org" on inventario_conteo_propuestas for select
  using (organization_id = public.current_org());
drop policy if exists "conteo propuestas insert org" on inventario_conteo_propuestas;
create policy "conteo propuestas insert org" on inventario_conteo_propuestas for insert
  with check (organization_id = public.current_org());
drop policy if exists "conteo propuestas update admin" on inventario_conteo_propuestas;
create policy "conteo propuestas update admin" on inventario_conteo_propuestas for update
  using (organization_id = public.current_org() and public.current_role() = 'admin');

notify pgrst, 'reload schema';
