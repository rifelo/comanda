-- =============================================================================
-- 0020 · POS devices — pair a terminal to an organization with a registration code
-- =============================================================================
-- Flow:
--   1. An admin generates a one-time registration code in Configuración → POS.
--   2. The POS device (a tablet with no user session) enters the code at /pos.
--   3. The server validates it, creates a `pos_devices` row, and hands the
--      device an opaque secret (stored hashed here, raw in an httpOnly cookie).
--   4. Every later /pos request resolves the device from that cookie via the
--      service-role client and loads the org's catalog — no user login needed.
--
-- Both tables are admin-managed through RLS. The device path itself never
-- touches these tables with the anon key: it runs server-side with the
-- service role after the token hash has been verified.
-- =============================================================================

-- ---------- pos_devices — a paired terminal ----------
create table pos_devices (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id   uuid references restaurants(id) on delete set null,
  name            text not null default 'Caja',
  token_hash      text not null unique,            -- sha256(secret), never the secret
  registered_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  revoked_at      timestamptz
);
create index pos_devices_org_idx on pos_devices(organization_id, registered_at desc);

-- ---------- pos_registration_codes — one-time pairing codes ----------
create table pos_registration_codes (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id   uuid references restaurants(id) on delete set null,
  code            text not null unique,            -- normalized: A-Z2-9, no dash
  label           text,                            -- suggested device name ("Caja 2")
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  used_at         timestamptz,
  device_id       uuid references pos_devices(id) on delete set null,
  cancelled_at    timestamptz
);
create index pos_registration_codes_org_idx
  on pos_registration_codes(organization_id, created_at desc);

-- ---------- ordenes ← which terminal rang it up ----------
alter table ordenes
  add column pos_device_id uuid references pos_devices(id) on delete set null;
create index ordenes_pos_device_idx on ordenes(pos_device_id);

-- =============================================================================
-- Row-Level Security — admins of the org manage devices + codes
-- =============================================================================
alter table pos_devices            enable row level security;
alter table pos_registration_codes enable row level security;

create policy "pos_devices admin read" on pos_devices for select
  using (organization_id = public.current_org() and public.current_role() = 'admin');
create policy "pos_devices admin write" on pos_devices for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

create policy "pos_codes admin read" on pos_registration_codes for select
  using (organization_id = public.current_org() and public.current_role() = 'admin');
create policy "pos_codes admin write" on pos_registration_codes for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

-- The folio RPC is called by the device path with the service role too.
grant execute on function public.next_orden_folio(uuid) to service_role;
