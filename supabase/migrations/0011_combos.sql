-- =============================================================================
-- 0011 · Combos (module 09) — productos bundled at a package price
-- =============================================================================
-- A combo groups productos (with quantities) sold together for `price_cop`.
-- The "regular" total and savings are derived from each producto's price_cop.
-- Org-scoped, admin-write RLS mirroring 0005_productos. Additive only.
-- =============================================================================

create table combos (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  description     text,
  price_cop       int  not null default 0 check (price_cop >= 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create index combos_org_idx on combos(organization_id);

create trigger combos_set_updated_at
  before update on combos
  for each row execute function public.set_updated_at();

create table combo_items (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  combo_id        uuid not null references combos(id) on delete cascade,
  producto_id     uuid not null references productos(id) on delete restrict,
  qty             int  not null default 1 check (qty > 0),
  position        int  not null default 0,
  unique (combo_id, producto_id)
);

create index combo_items_org_idx on combo_items(organization_id);
create index combo_items_combo_idx on combo_items(combo_id, position);

-- =============================================================================
-- Row-Level Security (org-read / admin-write)
-- =============================================================================
alter table combos      enable row level security;
alter table combo_items enable row level security;

create policy "combos read org" on combos for select
  using (organization_id = public.current_org());
create policy "combos admin write" on combos for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

create policy "combo_items read org" on combo_items for select
  using (organization_id = public.current_org());
create policy "combo_items admin write" on combo_items for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');
