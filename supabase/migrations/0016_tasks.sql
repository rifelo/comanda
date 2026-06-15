-- =============================================================================
-- 0016 · standalone "Tareas" — to-do tasks outside a shift
-- =============================================================================
-- template_tasks / ad_hoc_tasks both live inside a shift_instance. This table
-- is for general to-dos the owner schedules outside any shift: assigned to a
-- specific staff member (or anyone at the sede), optionally scheduled for a
-- day + time, and optionally requiring photo evidence to complete.
--
-- Scoped to a restaurant (sede); RLS reuses visible_restaurants(). Admins
-- create/delete; the assignee (or anyone, when unassigned) completes.
-- =============================================================================

create type task_status as enum ('pending', 'done', 'cancelled');

create table tasks (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  title          text not null,
  details        text,
  assigned_to    uuid references profiles(id) on delete set null,  -- null = cualquiera en la sede
  created_by     uuid not null references profiles(id),
  scheduled_date date,                                             -- null = sin fecha (backlog)
  due_time       time,                                             -- null = sin hora
  requires_photo boolean not null default false,                  -- staff must attach evidence
  status         task_status not null default 'pending',
  completed_by   uuid references profiles(id),
  completed_at   timestamptz,
  photo_url      text,                                            -- evidence captured on completion
  created_at     timestamptz not null default now()
);
create index tasks_restaurant_idx on tasks(restaurant_id);
create index tasks_assigned_idx on tasks(assigned_to);

alter table tasks enable row level security;

-- read: anyone who can see the restaurant (mirrors ad_hoc / novedades)
create policy "tasks read visible"
  on tasks for select
  using (restaurant_id in (select public.visible_restaurants()));

-- create: admin only, within their org's restaurants
create policy "tasks admin insert"
  on tasks for insert
  with check (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  );

-- update: admin (anything in org) OR the assignee / unassigned (staff completing)
create policy "tasks update"
  on tasks for update
  using (
    restaurant_id in (select public.visible_restaurants())
    and (
      public.current_role() = 'admin'
      or assigned_to is null
      or assigned_to = auth.uid()
    )
  )
  with check (
    restaurant_id in (select public.visible_restaurants())
    and (
      public.current_role() = 'admin'
      or assigned_to is null
      or assigned_to = auth.uid()
    )
  );

-- delete: admin only
create policy "tasks admin delete"
  on tasks for delete
  using (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  );
