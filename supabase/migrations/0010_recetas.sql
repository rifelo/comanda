-- =============================================================================
-- 0010 · Recetas (module 03) — producto → ingrediente line items
-- =============================================================================
-- A recipe is the bill of materials for a producto: one row per ingrediente
-- used, with a quantity. Recipe cost = Σ(qty × ingrediente.cost_cop); the
-- server action that mutates these rows recomputes `productos.cost_cop` and
-- `productos.margin_pct` so the catálogo and recetas views stay in sync.
--
-- Org-scoped, admin-write, mirrors 0005_productos / 0007_ingredientes RLS.
-- Additive only — no existing table is altered.
-- =============================================================================

create table receta_items (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  producto_id     uuid not null references productos(id) on delete cascade,
  ingrediente_id  uuid not null references ingredientes(id) on delete restrict,
  qty             numeric(12, 3) not null check (qty > 0),
  unit            text not null,
  note            text,
  position        int  not null default 0,
  created_at      timestamptz not null default now(),
  -- One line per ingrediente per recipe; edit qty instead of duplicating.
  unique (producto_id, ingrediente_id)
);

create index receta_items_org_idx on receta_items(organization_id);
create index receta_items_producto_idx on receta_items(producto_id, position);

-- =============================================================================
-- Row-Level Security (org-read / admin-write — mirrors 0007_ingredientes)
-- =============================================================================
alter table receta_items enable row level security;

create policy "receta_items read org"
  on receta_items for select
  using (organization_id = public.current_org());

create policy "receta_items admin write"
  on receta_items for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');
