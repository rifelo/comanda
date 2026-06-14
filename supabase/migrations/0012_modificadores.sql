-- =============================================================================
-- 0012 · Modificadores (module 08) — customization groups + options
-- =============================================================================
-- A modifier group ("Punto de la carne", "Extras") holds options, each with a
-- price delta. `single` = pick one, `multiple` = pick many. Org-scoped,
-- admin-write RLS mirroring 0005_productos. Additive only.
-- =============================================================================

create type modifier_group_type as enum ('single', 'multiple');

create table modifier_groups (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  type            modifier_group_type not null default 'single',
  required        boolean not null default false,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create index modifier_groups_org_idx on modifier_groups(organization_id, position);

create table modifier_options (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  group_id        uuid not null references modifier_groups(id) on delete cascade,
  name            text not null,
  price_delta_cop int  not null default 0,
  available       boolean not null default true,
  position        int  not null default 0,
  unique (group_id, name)
);

create index modifier_options_group_idx on modifier_options(group_id, position);
create index modifier_options_org_idx on modifier_options(organization_id);

-- =============================================================================
-- Row-Level Security (org-read / admin-write)
-- =============================================================================
alter table modifier_groups  enable row level security;
alter table modifier_options enable row level security;

create policy "modifier_groups read org" on modifier_groups for select
  using (organization_id = public.current_org());
create policy "modifier_groups admin write" on modifier_groups for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

create policy "modifier_options read org" on modifier_options for select
  using (organization_id = public.current_org());
create policy "modifier_options admin write" on modifier_options for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');
