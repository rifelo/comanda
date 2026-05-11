-- =============================================================================
-- 0003 · accept Google OAuth metadata in handle_new_user
-- =============================================================================
-- When a user signs in with Google for the first time, Supabase populates
-- `raw_user_meta_data` with the Google profile (name, picture, …). Our
-- original trigger only looked at `full_name`. Google's payload reliably
-- contains `name` and sometimes `full_name`; fall through to the email as
-- a last resort so the profile always gets a non-null display name.
--
-- The `organization_id`/`role` metadata path is unchanged — staff invites
-- still pre-create an auth user with that metadata, and the matching Google
-- sign-in links via Supabase identity linking (no second profile row).
-- =============================================================================

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
  meta_name text := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    new.email
  );
  new_org uuid;
begin
  -- First user signing up with no org_id meta => create a fresh org for them
  -- and make them admin (admin onboarding flow). Staff invites pre-populate
  -- organization_id and role on the auth user via the admin API.
  if meta_org is null then
    insert into organizations (name)
      values (coalesce(meta_name || '''s org', 'Mi Restaurante'))
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
