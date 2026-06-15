-- =============================================================================
-- 0015 · ad-hoc (immediate / same-day) tasks for the turnos module
-- =============================================================================
-- Template tasks are static and admin-defined per checklist_template, and
-- task_completions is a non-null FK to a template task — so a one-off task
-- raised during a running shift ("la máquina se dañó → llamar al técnico")
-- can't reuse them. ad_hoc_tasks are a separate, shift-scoped table that
-- carry their own state inline (status + completed_by/at), an optional
-- assignee (null = whole shift), and a nullable due_time (null = inmediata).
--
-- Admins create them; staff on the shift complete them. Streamed to the staff
-- shift board in real time via the supabase_realtime publication.
-- =============================================================================

create type ad_hoc_status as enum ('pending', 'done', 'cancelled');

create table ad_hoc_tasks (
  id                uuid primary key default uuid_generate_v4(),
  shift_instance_id uuid not null references shift_instances(id) on delete cascade,
  restaurant_id     uuid not null references restaurants(id) on delete cascade, -- denormalized for RLS (like novedades)
  title             text not null,
  instructions      text,
  assigned_to       uuid references profiles(id) on delete set null,            -- null = whole shift
  created_by        uuid not null references profiles(id),
  due_time          time,                                                       -- null = inmediata / ASAP; set = scheduled HH:MM
  status            ad_hoc_status not null default 'pending',
  completed_by      uuid references profiles(id),
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
);
create index ad_hoc_tasks_shift_idx on ad_hoc_tasks(shift_instance_id);
create index ad_hoc_tasks_restaurant_idx on ad_hoc_tasks(restaurant_id);

alter table ad_hoc_tasks enable row level security;

-- read: anyone who can see the restaurant (mirrors novedades / shifts read)
create policy "ad_hoc read visible"
  on ad_hoc_tasks for select
  using (restaurant_id in (select public.visible_restaurants()));

-- create: admin only, within their org's restaurants
create policy "ad_hoc admin insert"
  on ad_hoc_tasks for insert
  with check (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  );

-- update: admin (anything in their org) OR staff completing a task that's
-- assigned to them or to the whole shift.
create policy "ad_hoc update"
  on ad_hoc_tasks for update
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
create policy "ad_hoc admin delete"
  on ad_hoc_tasks for delete
  using (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  );

-- realtime: stream changes, and include the filter column (shift_instance_id)
-- in UPDATE/DELETE old-record payloads so client-side filters still match.
alter table ad_hoc_tasks replica identity full;
alter publication supabase_realtime add table ad_hoc_tasks;
