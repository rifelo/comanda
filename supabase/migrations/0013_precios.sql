-- =============================================================================
-- 0013 · Listas de precios (module 06) — per-list producto price overrides
-- =============================================================================
-- The base price lives on productos.price_cop. Additional lists (Delivery,
-- Happy Hour, …) override it per producto via price_list_items; a producto
-- with no item in a list simply falls back to its base price. Org-scoped,
-- admin-write RLS mirroring 0005_productos. Additive only.
-- =============================================================================

create table price_lists (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  description     text,
  position        int  not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create index price_lists_org_idx on price_lists(organization_id, position);

create table price_list_items (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  price_list_id   uuid not null references price_lists(id) on delete cascade,
  producto_id     uuid not null references productos(id) on delete cascade,
  price_cop       int  not null check (price_cop >= 0),
  unique (price_list_id, producto_id)
);

create index price_list_items_list_idx on price_list_items(price_list_id);
create index price_list_items_org_idx on price_list_items(organization_id);

-- =============================================================================
-- Row-Level Security (org-read / admin-write)
-- =============================================================================
alter table price_lists      enable row level security;
alter table price_list_items enable row level security;

create policy "price_lists read org" on price_lists for select
  using (organization_id = public.current_org());
create policy "price_lists admin write" on price_lists for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

create policy "price_list_items read org" on price_list_items for select
  using (organization_id = public.current_org());
create policy "price_list_items admin write" on price_list_items for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');
