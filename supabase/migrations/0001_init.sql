-- =============================================================================
-- Comanda — initial schema + RLS
-- =============================================================================
-- Multi-tenant by `organization_id` at the top, with `restaurant_id` on every
-- operational row. RLS isolates restaurants from each other so a staff bug
-- cannot leak cross-restaurant data.
-- =============================================================================

-- ---------- extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- enums ----------
create type user_role as enum ('staff', 'admin');
create type shift_kind as enum ('day', 'night');
create type shift_status as enum ('open', 'closed');

-- ---------- organizations ----------
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ---------- restaurants ----------
create table restaurants (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Bogota',
  created_at timestamptz not null default now()
);
create index restaurants_org_idx on restaurants(organization_id);

-- ---------- profiles (mirrors auth.users) ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'staff',
  created_at timestamptz not null default now()
);
create index profiles_org_idx on profiles(organization_id);

-- Auto-create a profile row when a Supabase auth user is created.
-- The full_name + organization_id must come from raw_user_meta_data set during sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_org uuid := nullif(new.raw_user_meta_data->>'organization_id', '')::uuid;
  meta_role user_role := coalesce(
    nullif(new.raw_user_meta_data->>'role', '')::user_role,
    'staff'
  );
  meta_name text := coalesce(new.raw_user_meta_data->>'full_name', new.email);
  new_org uuid;
begin
  -- First user signing up with no org_id meta => create a fresh org for them
  -- and make them admin (admin onboarding flow).
  if meta_org is null then
    insert into organizations (name) values (coalesce(meta_name || '''s org', 'Mi Restaurante'))
      returning id into new_org;
    insert into profiles (id, organization_id, full_name, role)
      values (new.id, new_org, meta_name, 'admin');
  else
    insert into profiles (id, organization_id, full_name, role)
      values (new.id, meta_org, meta_name, meta_role);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- restaurant memberships ----------
create table restaurant_members (
  user_id uuid not null references profiles(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  primary key (user_id, restaurant_id)
);
create index restaurant_members_restaurant_idx on restaurant_members(restaurant_id);

-- ---------- checklist templates (the editable paper sheet) ----------
create table checklist_templates (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  shift shift_kind not null,
  active boolean not null default true,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index templates_restaurant_idx on checklist_templates(restaurant_id);

-- ---------- template tasks (the rows on the sheet) ----------
create table template_tasks (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  order_index int not null,
  title text not null,
  instructions text,
  due_time time,                    -- e.g. '10:30:00' for "Abrir arqueo a las 10:30"
  requires_photo boolean not null default false
);
create index template_tasks_template_idx on template_tasks(template_id, order_index);

-- ---------- shift_instances (one row per restaurant × template × date) ----------
create table shift_instances (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  template_id uuid not null references checklist_templates(id) on delete restrict,
  date date not null,
  status shift_status not null default 'open',
  opened_by uuid references profiles(id),
  opened_at timestamptz,
  closed_by uuid references profiles(id),
  closed_at timestamptz,
  unique (restaurant_id, template_id, date)
);
create index shifts_restaurant_date_idx on shift_instances(restaurant_id, date desc);

-- ---------- task_completions ----------
create table task_completions (
  id uuid primary key default uuid_generate_v4(),
  shift_instance_id uuid not null references shift_instances(id) on delete cascade,
  template_task_id uuid not null references template_tasks(id) on delete cascade,
  completed_by uuid not null references profiles(id),
  completed_at timestamptz not null default now(),
  photo_url text,
  note text,
  unique (shift_instance_id, template_task_id)  -- one completion per task per shift
);
create index completions_shift_idx on task_completions(shift_instance_id);

-- ---------- novedades (daily incident reports) ----------
create table novedades (
  id uuid primary key default uuid_generate_v4(),
  shift_instance_id uuid not null references shift_instances(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  submitted_by uuid not null references profiles(id),
  submitted_at timestamptz not null default now(),
  body text not null
);
create index novedades_restaurant_idx on novedades(restaurant_id, submitted_at desc);

-- =============================================================================
-- Storage bucket for photo evidence
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', false)
on conflict (id) do nothing;

-- =============================================================================
-- Row-Level Security
-- =============================================================================
alter table organizations          enable row level security;
alter table restaurants            enable row level security;
alter table profiles               enable row level security;
alter table restaurant_members     enable row level security;
alter table checklist_templates    enable row level security;
alter table template_tasks         enable row level security;
alter table shift_instances        enable row level security;
alter table task_completions       enable row level security;
alter table novedades              enable row level security;

-- Helper: the calling user's org_id (from their profile).
create or replace function public.current_org()
returns uuid
language sql stable
as $$
  select organization_id from profiles where id = auth.uid()
$$;

-- Helper: the calling user's role.
create or replace function public.current_role()
returns user_role
language sql stable
as $$
  select role from profiles where id = auth.uid()
$$;

-- Helper: restaurant ids visible to the calling user.
-- Admins see every restaurant in their org. Staff see only assigned restaurants.
create or replace function public.visible_restaurants()
returns setof uuid
language sql stable
as $$
  select id from restaurants
  where organization_id = public.current_org()
    and (
      public.current_role() = 'admin'
      or id in (select restaurant_id from restaurant_members where user_id = auth.uid())
    )
$$;

-- ---------- profiles policies ----------
create policy "profiles read own org"
  on profiles for select
  using (organization_id = public.current_org());

create policy "profiles update own row"
  on profiles for update
  using (id = auth.uid());

-- ---------- organizations policies ----------
create policy "org read own"
  on organizations for select
  using (id = public.current_org());

create policy "org admin update"
  on organizations for update
  using (id = public.current_org() and public.current_role() = 'admin');

-- ---------- restaurants policies ----------
create policy "restaurants read visible"
  on restaurants for select
  using (id in (select public.visible_restaurants()));

create policy "restaurants admin write"
  on restaurants for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

-- ---------- restaurant_members policies ----------
create policy "members read own org"
  on restaurant_members for select
  using (restaurant_id in (select public.visible_restaurants()));

create policy "members admin write"
  on restaurant_members for all
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

-- ---------- checklist_templates policies ----------
create policy "templates read visible"
  on checklist_templates for select
  using (restaurant_id in (select public.visible_restaurants()));

create policy "templates admin write"
  on checklist_templates for all
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

-- ---------- template_tasks policies ----------
create policy "template_tasks read visible"
  on template_tasks for select
  using (
    template_id in (
      select id from checklist_templates where restaurant_id in (select public.visible_restaurants())
    )
  );

create policy "template_tasks admin write"
  on template_tasks for all
  using (
    public.current_role() = 'admin'
    and template_id in (
      select t.id from checklist_templates t
      join restaurants r on r.id = t.restaurant_id
      where r.organization_id = public.current_org()
    )
  )
  with check (
    public.current_role() = 'admin'
    and template_id in (
      select t.id from checklist_templates t
      join restaurants r on r.id = t.restaurant_id
      where r.organization_id = public.current_org()
    )
  );

-- ---------- shift_instances policies ----------
create policy "shifts read visible"
  on shift_instances for select
  using (restaurant_id in (select public.visible_restaurants()));

create policy "shifts staff update assigned"
  on shift_instances for update
  using (restaurant_id in (select public.visible_restaurants()));

create policy "shifts admin write"
  on shift_instances for insert
  with check (
    public.current_role() = 'admin'
    and restaurant_id in (
      select id from restaurants where organization_id = public.current_org()
    )
  );

-- ---------- task_completions policies ----------
create policy "completions read visible"
  on task_completions for select
  using (
    shift_instance_id in (
      select id from shift_instances where restaurant_id in (select public.visible_restaurants())
    )
  );

create policy "completions staff write"
  on task_completions for insert
  with check (
    completed_by = auth.uid()
    and shift_instance_id in (
      select id from shift_instances where restaurant_id in (select public.visible_restaurants())
    )
  );

create policy "completions staff delete"
  on task_completions for delete
  using (
    completed_by = auth.uid()
    and shift_instance_id in (
      select id from shift_instances where restaurant_id in (select public.visible_restaurants())
    )
  );

-- ---------- novedades policies ----------
create policy "novedades read visible"
  on novedades for select
  using (restaurant_id in (select public.visible_restaurants()));

create policy "novedades staff write"
  on novedades for insert
  with check (
    submitted_by = auth.uid()
    and restaurant_id in (select public.visible_restaurants())
  );

-- =============================================================================
-- Storage policies (task-photos bucket)
-- =============================================================================
-- Path convention: <restaurant_id>/<shift_instance_id>/<task_id>-<random>.jpg
-- Users can read/write only files under their visible restaurant's prefix.

create policy "task photos read visible"
  on storage.objects for select
  using (
    bucket_id = 'task-photos'
    and (storage.foldername(name))[1]::uuid in (select public.visible_restaurants())
  );

create policy "task photos staff insert"
  on storage.objects for insert
  with check (
    bucket_id = 'task-photos'
    and (storage.foldername(name))[1]::uuid in (select public.visible_restaurants())
  );
