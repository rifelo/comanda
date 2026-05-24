-- =============================================================================
-- 0007 · Ingredientes catálogo + stock tracking (module 02)
-- =============================================================================
-- Mirrors 0005_productos: org-scoped catalog, label/position tree, integer
-- COP costs, shared `set_updated_at()` trigger. Adds `ingrediente_movements`
-- as the audit log for stock changes; a BEFORE INSERT trigger atomically
-- updates `ingredientes.stock_current`, so the table is the single source of
-- truth for stock history.
-- =============================================================================

-- ---------- enums ----------
create type ingrediente_movement_type as enum ('venta', 'gasto', 'ajuste', 'import');

-- ---------- ingrediente_categorias (self-referencing tree, org-scoped) ----------
create table ingrediente_categorias (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  parent_id uuid references ingrediente_categorias(id) on delete cascade,
  label text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index ingrediente_categorias_org_parent_idx
  on ingrediente_categorias(organization_id, parent_id, position);

-- Sibling labels must be unique under the same parent (including root level).
-- `nulls not distinct` treats two `parent_id is null` rows as conflicting,
-- so root categories can't share a label either. Matches 0005_productos.
create unique index ingrediente_categorias_unique_sibling_label
  on ingrediente_categorias(organization_id, parent_id, label) nulls not distinct;

-- ---------- ingredientes (org-scoped) ----------
create table ingredientes (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category_id     uuid references ingrediente_categorias(id) on delete set null,
  name            text not null,
  unit            text not null,
  stock_current   numeric(12, 3) not null default 0,
  stock_min       numeric(12, 3) not null default 0 check (stock_min >= 0),
  merma_pct       numeric(5, 2)  not null default 0
                    check (merma_pct >= 0 and merma_pct <= 100),
  cost_cop        int            not null default 0 check (cost_cop >= 0),
  archived        boolean        not null default false,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),
  unique (organization_id, name)
);

create index ingredientes_org_idx
  on ingredientes(organization_id) where archived = false;
create index ingredientes_org_category_idx
  on ingredientes(organization_id, category_id);

-- Trigram GIN for the ingredientes search box (matches name).
create index ingredientes_name_trgm_idx
  on ingredientes using gin (lower(name) gin_trgm_ops);

create trigger ingredientes_set_updated_at
  before update on ingredientes
  for each row execute function public.set_updated_at();

-- ---------- ingrediente_movements (audit log, mutates stock via trigger) ----------
create table ingrediente_movements (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  ingrediente_id  uuid not null references ingredientes(id) on delete cascade,
  type            ingrediente_movement_type not null,
  delta           numeric(12, 3) not null check (delta <> 0),
  -- Set by the BEFORE INSERT trigger; never trust client-supplied values.
  balance_after   numeric(12, 3) not null default 0,
  unit_cost_cop   int,
  note            text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create index ingrediente_movements_org_idx
  on ingrediente_movements(organization_id, created_at desc);
create index ingrediente_movements_ingrediente_idx
  on ingrediente_movements(ingrediente_id, created_at desc);

create or replace function public.apply_ingrediente_movement()
returns trigger
language plpgsql
as $$
declare
  current_stock numeric(12, 3);
  ing_org       uuid;
  new_balance   numeric(12, 3);
begin
  -- Row-lock the ingrediente so concurrent inserts serialize correctly.
  select stock_current, organization_id
    into current_stock, ing_org
    from ingredientes
   where id = new.ingrediente_id
     for update;

  if current_stock is null then
    raise exception 'ingrediente_movements: ingrediente % not found', new.ingrediente_id;
  end if;
  if ing_org <> new.organization_id then
    raise exception 'ingrediente_movements: ingrediente does not belong to organization_id %', new.organization_id;
  end if;

  new_balance := current_stock + new.delta;
  if new_balance < 0 and new.type in ('venta', 'gasto') then
    raise exception 'ingrediente_movements: insufficient stock (balance would be %)', new_balance;
  end if;

  update ingredientes
     set stock_current = new_balance
   where id = new.ingrediente_id;

  new.balance_after := new_balance;
  return new;
end;
$$;

create trigger ingrediente_movements_apply
  before insert on ingrediente_movements
  for each row execute function public.apply_ingrediente_movement();

-- =============================================================================
-- Row-Level Security (org-read / admin-write — mirrors 0005_productos)
-- =============================================================================
alter table ingrediente_categorias enable row level security;
alter table ingredientes           enable row level security;
alter table ingrediente_movements  enable row level security;

-- ---------- ingrediente_categorias policies ----------
create policy "ingrediente_categorias read org"
  on ingrediente_categorias for select
  using (organization_id = public.current_org());

create policy "ingrediente_categorias admin write"
  on ingrediente_categorias for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

-- ---------- ingredientes policies ----------
create policy "ingredientes read org"
  on ingredientes for select
  using (organization_id = public.current_org());

create policy "ingredientes admin write"
  on ingredientes for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

-- ---------- ingrediente_movements policies ----------
-- Admins own the history; staff may insert (POS / kitchen flows trigger
-- venta/gasto rows) but cannot edit or delete past movements.
create policy "ingrediente_movements read org"
  on ingrediente_movements for select
  using (organization_id = public.current_org());

create policy "ingrediente_movements staff insert"
  on ingrediente_movements for insert
  with check (organization_id = public.current_org());

create policy "ingrediente_movements admin write"
  on ingrediente_movements for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');
