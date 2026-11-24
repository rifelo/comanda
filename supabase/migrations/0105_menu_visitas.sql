-- Visits to the public menu that came from a printed piece with its own QR
-- (cafepayo.com/desde/<origen>, e.g. the poster at ESE Salud Yopal): one row
-- per scan, so the owner can tell how many people each piece brings.
create table if not exists menu_visitas (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen ~ '^[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  user_agent text
);

create index if not exists menu_visitas_origen_idx on menu_visitas (origen, created_at desc);

alter table menu_visitas enable row level security;

comment on table menu_visitas is
  'One row per scan of a QR printed for a place (cafepayo.com/desde/<origen>). Written with the service role only.';
