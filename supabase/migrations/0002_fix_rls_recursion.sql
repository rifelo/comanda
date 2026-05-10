-- =============================================================================
-- 0002 · fix RLS recursion in helper functions
-- =============================================================================
-- The RLS policies on `profiles`, `restaurants`, and `restaurant_members`
-- reference these helpers, and the helpers themselves read those tables —
-- without `security definer` Postgres re-enters the policy and recurses until
-- it hits the stack-depth limit (error 54001).
--
-- `security definer` runs the function body with the OWNER's privileges
-- (bypassing RLS on the inner queries). The functions only return scalars
-- derived from the calling user's `auth.uid()`, so they leak nothing beyond
-- what the caller could already see via a working policy.
-- =============================================================================

create or replace function public.current_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from profiles where id = auth.uid()
$$;

create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.visible_restaurants()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from restaurants
  where organization_id = public.current_org()
    and (
      public.current_role() = 'admin'
      or id in (select restaurant_id from restaurant_members where user_id = auth.uid())
    )
$$;
