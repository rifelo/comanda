-- =============================================================================
-- Productos · Ingredients catalog + stock tracking
-- =============================================================================
-- Restaurant-scoped (matches the existing `checklist_*` pattern). Three tables:
--
--   ingredient_categories — hierarchical tree (4 levels: Cat → Subcat →
--                            Principal → Subing), parent_id self-ref. `depth`
--                            is derived from parent and capped by a trigger.
--   ingredients           — leaf rows. Self-ref `parent_ingredient_id` for
--                            sub-ingredients linked to a principal.
--   ingredient_movements  — audit log of stock changes. A BEFORE INSERT trigger
--                            atomically updates `ingredients.stock_current`
--                            and stamps `balance_after`, so the table is the
--                            single source of truth for stock history.
-- =============================================================================

-- ---------- enums ----------
create type ingredient_movement_type as enum ('venta', 'gasto', 'ajuste', 'import');

-- ---------- ingredient_categories ----------
create table ingredient_categories (
  id            uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  parent_id     uuid references ingredient_categories(id) on delete cascade,
  name          text not null,
  -- 0=root, 1=subcat, 2=principal, 3=sub-ing. Maintained by trigger.
  depth         smallint not null default 0,
  sort_index    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, parent_id, name)
);
create index ingredient_categories_restaurant_idx on ingredient_categories(restaurant_id);
create index ingredient_categories_parent_idx     on ingredient_categories(parent_id);

-- Derive depth from parent on insert/update; enforce 4-level cap + same-restaurant.
create or replace function public.set_ingredient_category_depth()
returns trigger
language plpgsql
as $$
declare
  parent_depth smallint;
  parent_rest  uuid;
begin
  if new.parent_id is null then
    new.depth := 0;
  else
    select depth, restaurant_id
      into parent_depth, parent_rest
      from ingredient_categories
     where id = new.parent_id;
    if parent_depth is null then
      raise exception 'ingredient_categories: parent % does not exist', new.parent_id;
    end if;
    if parent_rest <> new.restaurant_id then
      raise exception 'ingredient_categories: parent and child must share restaurant_id';
    end if;
    new.depth := parent_depth + 1;
    if new.depth > 3 then
      raise exception 'ingredient_categories: tree depth limited to 4 levels';
    end if;
  end if;
  return new;
end;
$$;

create trigger ingredient_categories_set_depth
  before insert or update of parent_id, restaurant_id on ingredient_categories
  for each row execute function public.set_ingredient_category_depth();

-- ---------- ingredients ----------
create table ingredients (
  id                   uuid primary key default uuid_generate_v4(),
  restaurant_id        uuid not null references restaurants(id) on delete cascade,
  category_id          uuid references ingredient_categories(id) on delete set null,
  parent_ingredient_id uuid references ingredients(id) on delete cascade,
  name                 text not null,
  unit                 text not null,
  stock_current        numeric(12, 3) not null default 0,
  stock_min            numeric(12, 3) not null default 0 check (stock_min >= 0),
  merma_pct            numeric(5, 2)  not null default 0
                         check (merma_pct >= 0 and merma_pct <= 100),
  cost_per_unit        numeric(12, 2) not null default 0 check (cost_per_unit >= 0),
  archived             boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index ingredients_restaurant_idx on ingredients(restaurant_id) where archived = false;
create index ingredients_category_idx   on ingredients(category_id);
create index ingredients_parent_idx     on ingredients(parent_ingredient_id);

-- updated_at touch
create or replace function public.touch_ingredient_updated_at()
returns trigger
language plpgsql
as $$ begin new.updated_at := now(); return new; end; $$;

create trigger ingredients_touch_updated_at
  before update on ingredients
  for each row execute function public.touch_ingredient_updated_at();

-- ---------- ingredient_movements ----------
-- Audit log. Inserting a row mutates ingredients.stock_current atomically
-- via the BEFORE INSERT trigger, so apps never write stock_current directly.
create table ingredient_movements (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  ingredient_id  uuid not null references ingredients(id) on delete cascade,
  type           ingredient_movement_type not null,
  delta          numeric(12, 3) not null check (delta <> 0),
  -- Set by the trigger; never trust client-supplied values.
  balance_after  numeric(12, 3) not null default 0,
  unit_cost      numeric(12, 2),
  note           text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);
create index ingredient_movements_restaurant_idx
  on ingredient_movements(restaurant_id, created_at desc);
create index ingredient_movements_ingredient_idx
  on ingredient_movements(ingredient_id, created_at desc);

create or replace function public.apply_ingredient_movement()
returns trigger
language plpgsql
as $$
declare
  current_stock numeric(12, 3);
  ing_rest      uuid;
  new_balance   numeric(12, 3);
begin
  -- Row-lock the ingredient so concurrent inserts serialize correctly.
  select stock_current, restaurant_id
    into current_stock, ing_rest
    from ingredients
   where id = new.ingredient_id
     for update;

  if current_stock is null then
    raise exception 'ingredient_movements: ingredient % not found', new.ingredient_id;
  end if;
  if ing_rest <> new.restaurant_id then
    raise exception 'ingredient_movements: ingredient does not belong to restaurant_id %', new.restaurant_id;
  end if;

  new_balance := current_stock + new.delta;
  if new_balance < 0 and new.type in ('venta', 'gasto') then
    raise exception 'ingredient_movements: insufficient stock (balance would be %)', new_balance;
  end if;

  update ingredients
     set stock_current = new_balance
   where id = new.ingredient_id;

  new.balance_after := new_balance;
  return new;
end;
$$;

create trigger ingredient_movements_apply
  before insert on ingredient_movements
  for each row execute function public.apply_ingredient_movement();

-- =============================================================================
-- RLS
-- =============================================================================
alter table ingredient_categories enable row level security;
alter table ingredients           enable row level security;
alter table ingredient_movements  enable row level security;

-- Read: any user who can see the restaurant.
create policy "ingredient_categories read visible"
  on ingredient_categories for select
  using (restaurant_id in (select public.visible_restaurants()));

create policy "ingredients read visible"
  on ingredients for select
  using (restaurant_id in (select public.visible_restaurants()));

create policy "ingredient_movements read visible"
  on ingredient_movements for select
  using (restaurant_id in (select public.visible_restaurants()));

-- Write: admin in the same org as the restaurant.
create policy "ingredient_categories admin write"
  on ingredient_categories for all
  using (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  )
  with check (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  );

create policy "ingredients admin write"
  on ingredients for all
  using (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  )
  with check (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  );

-- Movements: admins manage freely; staff can insert (for sales/waste flows
-- triggered from POS / kitchen surfaces) but cannot edit or delete history.
create policy "ingredient_movements staff insert"
  on ingredient_movements for insert
  with check (restaurant_id in (select public.visible_restaurants()));

create policy "ingredient_movements admin write"
  on ingredient_movements for all
  using (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  )
  with check (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  );
