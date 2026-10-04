-- =============================================================================
-- 0041 · POS print jobs — labels relayed to the station that has the printer
-- =============================================================================
-- The label printer hangs off one register (Web Serial, USB). A tablet taking
-- orders can't print, so it drops what it wants printed here and the register
-- with the printer claims the rows and prints them. `payload` is the label
-- spec (what to draw), never pixels: the printing station renders it.
-- A job nobody claims within a few minutes is ignored (see reclamarEtiquetas):
-- a label that comes out half an hour late is worse than none.
-- =============================================================================
create table if not exists pos_print_jobs (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Order inside one batch (rows of a batch share created_at).
  seq int not null default 0,
  payload jsonb not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'reclamada')),
  -- Station that asked for the label / station that printed it.
  source text,
  claimed_by text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists pos_print_jobs_queue_idx
  on pos_print_jobs(organization_id, status, created_at);

alter table pos_print_jobs enable row level security;
drop policy if exists "pos_print_jobs read org" on pos_print_jobs;
create policy "pos_print_jobs read org" on pos_print_jobs for select
  using (organization_id = public.current_org());
drop policy if exists "pos_print_jobs write org" on pos_print_jobs;
create policy "pos_print_jobs write org" on pos_print_jobs for all
  using (organization_id = public.current_org())
  with check (organization_id = public.current_org());

notify pgrst, 'reload schema';
