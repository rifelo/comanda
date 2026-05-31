-- =============================================================================
-- 0009 · Turnos redesign — shifts own tasks, weekly assignments, sede settings
-- =============================================================================
-- The redesign collapses Plantillas into Turnos: a checklist_template ("shift")
-- now also defines its operating hours and weekday mask. A new
-- weekly_assignments table keys the assignment grid per week. Sede settings
-- (logo, currency, theme) move onto `restaurants`, and members gain
-- phone/active so the team-management UI can drive them.
--
-- Tables intentionally KEEP their existing names (`checklist_templates`,
-- `template_tasks`) — the domain language is "shift" but renaming would
-- ripple through every FK + RLS policy + existing query in /shift/[id].
-- =============================================================================

-- ---------- shift definitions: hours + days mask ----------
alter table checklist_templates
  add column inicio time not null default '10:30',
  add column fin    time not null default '14:30',
  add column dias   boolean[] not null default '{t,t,t,t,t,t,t}'
    check (array_length(dias, 1) = 7);

-- ---------- per-week roster assignments ----------
create table weekly_assignments (
  id            uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  week_start    date not null,                                 -- ISO Monday
  template_id   uuid not null references checklist_templates(id) on delete cascade,
  dia_idx       smallint not null check (dia_idx between 0 and 6),
  member_id     uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, week_start, template_id, dia_idx)
);
create index weekly_assignments_restaurant_week_idx
  on weekly_assignments(restaurant_id, week_start);

alter table weekly_assignments enable row level security;

-- RLS: mirror the shape of checklist_templates policies (read = visible
-- restaurant; write = admin in the same org).
create policy "weekly_assignments read visible"
  on weekly_assignments for select
  using (restaurant_id in (select public.visible_restaurants()));

create policy "weekly_assignments admin write"
  on weekly_assignments for all
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

-- ---------- sede settings ----------
-- logo_url stores a dataURL or a public URL; currency is ISO 4217-ish (COP);
-- theme is one of the 5 design palettes (papel default).
alter table restaurants
  add column logo_url text,
  add column currency text not null default 'COP',
  add column theme    text not null default 'papel'
    check (theme in ('papel','sepia','carbon','indigo','rojo'));

-- ---------- roster fields on existing members ----------
alter table restaurant_members
  add column phone  text,
  add column active boolean not null default true;
