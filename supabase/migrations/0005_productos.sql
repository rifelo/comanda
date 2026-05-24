-- =============================================================================
-- 0005 · Productos catálogo (module 01)
-- =============================================================================
-- Adds the org-scoped product catalogue: categorías tree, productos rows,
-- and per-user favorites. RLS mirrors the org-read / admin-write pattern
-- used by `restaurants` and `checklist_templates`, but scoped to
-- `organization_id` directly (catalogue is shared across all sedes of an
-- org). Module 04 (Control de stock) will later own `productos.stock_status`.
-- =============================================================================

-- ---------- extensions ----------
create extension if not exists pg_trgm

-- ---------- enums ----------
create type producto_stock_status as enum ('ok', 'bajo', 'sin')

-- ---------- shared trigger helper ----------
-- Generic updated_at toucher; first table to use it but reusable by future
-- editable resources (precios, modificadores, …).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$

-- ---------- producto_categorias (self-referencing tree, org-scoped) ----------
create table producto_categorias (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_id uuid references producto_categorias(id) on delete cascade,
  label text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
)

create index producto_categorias_org_parent_idx
  on producto_categorias(organization_id, parent_id, position)

-- Sibling labels must be unique under the same parent (including root level).
-- `nulls not distinct` treats two `parent_id is null` rows as conflicting,
-- so root categories can't share a label either. Postgres 15+.
create unique index producto_categorias_unique_sibling_label
  on producto_categorias(organization_id, parent_id, label) nulls not distinct

-- ---------- productos (org-scoped) ----------
create table productos (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category_id uuid references producto_categorias(id) on delete set null,
  name text not null,
  sku text not null,
  price_cop int not null default 0,
  cost_cop int not null default 0,
  -- Generated/stored: round((price - cost) / price * 100); 0 when price = 0.
  -- If price_cop/cost_cop types change, this column must be dropped & recreated.
  margin_pct int generated always as (
    case
      when price_cop > 0
        then round(((price_cop - cost_cop)::numeric / price_cop) * 100)::int
      else 0
    end
  ) stored,
  stock_status producto_stock_status not null default 'ok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
)

create index productos_org_idx on productos(organization_id)

create index productos_org_category_idx on productos(organization_id, category_id)

create index productos_org_stock_idx on productos(organization_id, stock_status)

-- Trigram GIN for the catálogo search box (matches name + sku in one shot).
create index productos_name_sku_trgm_idx on productos
  using gin ((lower(name) || ' ' || lower(sku)) gin_trgm_ops)

create trigger productos_set_updated_at
  before update on productos
  for each row execute function public.set_updated_at()

-- ---------- producto_favorites (per-user) ----------
create table producto_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, producto_id)
)

create index producto_favorites_producto_idx on producto_favorites(producto_id)

-- =============================================================================
-- Row-Level Security
-- =============================================================================
alter table producto_categorias  enable row level security

alter table productos            enable row level security

alter table producto_favorites   enable row level security

-- ---------- producto_categorias policies ----------
create policy "categorias read org"
  on producto_categorias for select
  using (organization_id = public.current_org())

create policy "categorias admin write"
  on producto_categorias for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin')

-- ---------- productos policies ----------
create policy "productos read org"
  on productos for select
  using (organization_id = public.current_org())

create policy "productos admin write"
  on productos for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin')

-- ---------- producto_favorites policies ----------
-- Favorites are user-owned. Reads + writes both gated on auth.uid().
-- (The producto must already be visible via productos RLS to be inserted,
-- since the FK lookup runs under the caller's role.)
create policy "favorites read own"
  on producto_favorites for select
  using (user_id = auth.uid())

create policy "favorites write own"
  on producto_favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid())