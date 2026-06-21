-- =============================================================================
-- 0019 · Órdenes (POS) — persisted sales from the Punto de venta terminal
-- =============================================================================
-- The /pos terminal now writes real orders. Adds:
--   · producto_modifier_groups — which modifier groups apply to a product
--     (the catalog had no such link; POS falls back to "all groups" only when
--     this table is empty for the org).
--   · ordenes / orden_items     — header + line items for a completed sale.
--   · orden_counters + next_orden_folio() — atomic per-org folio sequence.
-- Órdenes are writable by any org member (cashiers), not just admins, so the
-- RLS here is org-scoped (not admin-gated) — unlike 0005/0011/0012.
-- =============================================================================

-- ---------- producto ↔ modifier group link (org-scoped, admin-write) ----------
create table producto_modifier_groups (
  organization_id uuid not null references organizations(id) on delete cascade,
  producto_id     uuid not null references productos(id) on delete cascade,
  group_id        uuid not null references modifier_groups(id) on delete cascade,
  position        int  not null default 0,
  primary key (producto_id, group_id)
);
create index producto_modifier_groups_org_idx
  on producto_modifier_groups(organization_id);
create index producto_modifier_groups_group_idx
  on producto_modifier_groups(group_id);

alter table producto_modifier_groups enable row level security;

create policy "prod_mod_groups read org" on producto_modifier_groups for select
  using (organization_id = public.current_org());
create policy "prod_mod_groups admin write" on producto_modifier_groups for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

-- ---------- ordenes (header) ----------
create table ordenes (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id   uuid references restaurants(id) on delete set null,
  folio           text not null,
  order_type      text not null check (order_type in ('aqui', 'llevar', 'domicilio')),
  status          text not null default 'enviada'
                    check (status in ('enviada', 'cancelada')),
  subtotal_cop    int  not null default 0 check (subtotal_cop >= 0),
  total_cop       int  not null default 0 check (total_cop >= 0),
  sin_gluten      boolean not null default false,
  notes           text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index ordenes_org_created_idx on ordenes(organization_id, created_at desc);
create index ordenes_restaurant_idx on ordenes(restaurant_id, created_at desc);

-- ---------- orden_items (lines) ----------
create table orden_items (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  orden_id        uuid not null references ordenes(id) on delete cascade,
  kind            text not null check (kind in ('item', 'combo')),
  producto_id     uuid references productos(id) on delete set null,
  combo_id        uuid references combos(id) on delete set null,
  name            text not null,           -- snapshot of the name at sale time
  qty             int  not null check (qty > 0),
  unit_price_cop  int  not null check (unit_price_cop >= 0),
  mods            jsonb not null default '{}'::jsonb,
  position        int  not null default 0
);
create index orden_items_orden_idx on orden_items(orden_id, position);
create index orden_items_org_idx on orden_items(organization_id);

-- =============================================================================
-- Row-Level Security (org-read / org-member-write — cashiers, not admin-only)
-- =============================================================================
alter table ordenes     enable row level security;
alter table orden_items enable row level security;

create policy "ordenes read org" on ordenes for select
  using (organization_id = public.current_org());
create policy "ordenes write org" on ordenes for all
  using (organization_id = public.current_org())
  with check (organization_id = public.current_org());

create policy "orden_items read org" on orden_items for select
  using (organization_id = public.current_org());
create policy "orden_items write org" on orden_items for all
  using (organization_id = public.current_org())
  with check (organization_id = public.current_org());

-- =============================================================================
-- Folio counter — atomic per-org running sequence ("A-247")
-- =============================================================================
create table orden_counters (
  organization_id uuid primary key references organizations(id) on delete cascade,
  last_seq        int  not null default 0
);
alter table orden_counters enable row level security;
-- No direct policies: only reachable through the SECURITY DEFINER function.

-- Hand out the next folio number for an org, atomically. SECURITY DEFINER so it
-- bypasses RLS on orden_counters; search_path pinned for safety.
create or replace function public.next_orden_folio(p_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  insert into orden_counters(organization_id, last_seq)
    values (p_org, 1)
  on conflict (organization_id)
    do update set last_seq = orden_counters.last_seq + 1
  returning last_seq into v;
  return v;
end;
$$;

grant execute on function public.next_orden_folio(uuid) to authenticated;
