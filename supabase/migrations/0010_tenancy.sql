-- =============================================================================
-- 0010 · multi-tenancy by subdomain (<slug>.co-manda.com)
-- =============================================================================
-- Tenant = organization. The data model is already org-isolated via RLS
-- (current_org / visible_restaurants in 0001/0002); this migration only adds
-- the routing/onboarding layer:
--   • organizations.slug      — the subdomain a tenant claims at onboarding
--   • organizations.onboarded_at — null until the admin has claimed a slug +
--                                  created their first restaurant
--   • two security-definer resolvers so a *pre-auth* request on a tenant
--     subdomain can map slug -> org without a broad `organizations` SELECT
--     policy (same rationale as current_org() in 0002).
-- =============================================================================

alter table organizations
  add column slug text unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'),
  add column onboarded_at timestamptz; -- null => onboarding not finished

create index organizations_slug_idx on organizations(slug);

-- ---------- slug -> org id (scalar) ----------
-- Used by middleware host resolution and the onboarding uniqueness check.
-- Returns only an opaque id derived from a public slug, so it leaks nothing.
create or replace function public.org_id_for_slug(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from organizations where slug = p_slug
$$;

-- ---------- public branding for the pre-auth tenant login page ----------
-- An anon visitor on <slug>.co-manda.com needs the tenant's display name
-- before they authenticate. Returns only non-sensitive columns.
create or replace function public.org_public_by_slug(p_slug text)
returns table (id uuid, name text, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select id, name, slug from organizations where slug = p_slug
$$;

grant execute on function public.org_id_for_slug(text) to anon, authenticated;
grant execute on function public.org_public_by_slug(text) to anon, authenticated;

-- ---------- backfill existing organizations ----------
-- Give every slug-less org a deterministic slug derived from its name
-- (apostrophes stripped, non-alphanumerics collapsed to '-', deduped with a
-- numeric suffix, short/empty names fall back to an id-based slug) and mark it
-- onboarded so existing tenants skip the onboarding gate. Fresh local DBs get
-- their slug straight from seed.sql instead.
update organizations o
set slug = g.slug,
    onboarded_at = coalesce(o.onboarded_at, now())
from (
  select id,
         case
           when char_length(base) >= 3 then
             case when rn = 1 then left(base, 32)
                  else left(base, 27) || '-' || rn::text end
           else 'org-' || left(replace(id::text, '-', ''), 8)
         end as slug
  from (
    select id, base,
           row_number() over (partition by base order by created_at, id) as rn
    from (
      select id, created_at,
             trim(both '-' from
               regexp_replace(
                 regexp_replace(lower(name), '''', '', 'g'),
                 '[^a-z0-9]+', '-', 'g')) as base
      from organizations
      where slug is null
    ) s
  ) r
) g
where o.id = g.id;
