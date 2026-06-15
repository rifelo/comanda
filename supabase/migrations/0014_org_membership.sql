-- =============================================================================
-- 0014 · organization membership (many-to-many) + org selection/creation
-- =============================================================================
-- Today the app is strictly one-org-per-user: `profiles.organization_id` is the
-- single, NOT NULL tenant pointer and `handle_new_user` auto-creates an org for
-- every brand-new sign-in. This migration introduces a membership join table so
-- a user can belong to (and switch between) multiple orgs, while KEEPING
-- `profiles.organization_id` as the *currently-active* org pointer — every
-- existing RLS policy/query that resolves the tenant through `current_org()`
-- stays untouched.
--
-- The new policies/RPCs are written to avoid the RLS recursion that 0002 fixed:
-- `organization_members` policies never reference `organizations`/`profiles`,
-- and the security-definer RPCs run with the owner's privileges.
-- =============================================================================

-- a) Membership table -------------------------------------------------------
create table organization_members (
  user_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role user_role not null default 'admin',
  created_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);
create index organization_members_org_idx on organization_members(organization_id);
alter table organization_members enable row level security;

-- Must be self-scoped (NOT current_org-scoped) so the selector can list every
-- org a user belongs to, regardless of the active org. No recursion: this
-- policy never references organizations/profiles.
create policy "org members read own"
  on organization_members for select
  using (user_id = auth.uid());
-- No user-facing insert/update/delete: membership changes go through the
-- security-definer RPCs below (and the existing service-role invite flow).

-- b) Make the active-org pointer nullable ------------------------------------
-- `current_org()` already returns null gracefully for a no-org user (stays the
-- 0002 security-definer version), and all RLS `= current_org()` comparisons
-- then match no rows — correct.
alter table profiles alter column organization_id drop not null;

-- c) Backfill memberships for existing users ---------------------------------
-- Existing admins become owners of their org.
insert into organization_members (user_id, organization_id, role)
  select id, organization_id, role from profiles
  where organization_id is not null
  on conflict do nothing;

-- d) Let users read names of all orgs they belong to -------------------------
-- The old "org read own" only exposed the *active* org, so the selector
-- couldn't show other orgs' names.
drop policy if exists "org read own" on organizations;
create policy "org read member"
  on organizations for select
  using (
    id = public.current_org()
    or id in (select organization_id from organization_members where user_id = auth.uid())
  );

-- e) Defense-in-depth on profiles update -------------------------------------
-- Prevents a direct client update from jumping the active pointer to an org the
-- user isn't a member of.
drop policy if exists "profiles update own row" on profiles;
create policy "profiles update own row"
  on profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (
      organization_id is null
      or organization_id in (select organization_id from organization_members where user_id = auth.uid())
    )
  );

-- f) Security-definer RPCs ---------------------------------------------------
-- Org creation is otherwise blocked (organizations has no INSERT policy); these
-- mirror the existing security-definer pattern from 0002.
create or replace function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_org uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if org_name is null or length(trim(org_name)) = 0 then raise exception 'name required'; end if;
  insert into organizations (name) values (trim(org_name)) returning id into new_org;
  insert into organization_members (user_id, organization_id, role) values (uid, new_org, 'admin');
  update profiles set organization_id = new_org, role = 'admin' where id = uid;  -- make active + owner
  return new_org;
end; $$;

create or replace function public.switch_organization(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mrole user_role;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select role into mrole from organization_members where user_id = uid and organization_id = target;
  if mrole is null then raise exception 'not a member'; end if;
  update profiles set organization_id = target, role = mrole where id = uid;  -- pointer + role follow membership
end; $$;

grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.switch_organization(uuid) to authenticated;

-- g) Rewrite handle_new_user() ----------------------------------------------
-- Stop auto-creating an org; create a membership for invited staff. Brand-new
-- Google user → profile with organization_id = null (→ selector). Invited staff
-- (inviteMember in app/(admin)/configuracion/equipo/_actions.ts) keeps working
-- and now also gets an organization_members row.
--
-- Keeps the 3-way display-name fallback (full_name → name → email) introduced
-- by the live 0003 trigger.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta_org uuid := nullif(new.raw_user_meta_data->>'organization_id', '')::uuid;
  meta_role user_role := coalesce(
    nullif(new.raw_user_meta_data->>'role', '')::user_role,
    'staff'
  );
  meta_name text := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    new.email
  );
begin
  insert into profiles (id, organization_id, full_name, role)
    values (
      new.id,
      meta_org,
      meta_name,
      case when meta_org is null then 'staff' else meta_role end
    );
  if meta_org is not null then
    insert into organization_members (user_id, organization_id, role)
      values (new.id, meta_org, meta_role) on conflict do nothing;
  end if;
  return new;
end; $$;
