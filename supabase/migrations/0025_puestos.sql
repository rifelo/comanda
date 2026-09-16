-- =============================================================================
-- 0025 · Puestos — roles/stations inside a turno, per-puesto assignments,
--        soft handoffs between puestos
-- =============================================================================
-- A morning shift is really several checklists done by different people:
-- Apertura (owner opens the shop), Barista, Aseo. `puestos` are per-sede
-- roles; `template_puestos` says which puestos a turno uses, in what order,
-- and which task of another puesto gates its start (soft handoff: the
-- waiting puesto sees "Esperando a …" and may start anyway). Tasks point at
-- a puesto (null = compartida / everyone). Weekly assignments gain a puesto
-- so one person is assigned per puesto per day; null keeps the legacy
-- one-person-per-turno rows working.
-- =============================================================================

create table puestos (
  id            uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  -- design token: ink | red | green | amber | indigo
  color         text not null default 'ink',
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, name)
);
create index puestos_restaurant_idx on puestos(restaurant_id, position);

alter table template_tasks
  add column puesto_id uuid references puestos(id) on delete set null;
create index template_tasks_puesto_idx on template_tasks(puesto_id);

create table template_puestos (
  template_id       uuid not null references checklist_templates(id) on delete cascade,
  puesto_id         uuid not null references puestos(id) on delete cascade,
  position          smallint not null default 0,
  -- Soft handoff gate: this puesto "starts" once that task is completed.
  waits_for_task_id uuid references template_tasks(id) on delete set null,
  primary key (template_id, puesto_id)
);

alter table weekly_assignments
  add column puesto_id uuid references puestos(id) on delete cascade;
alter table weekly_assignments
  drop constraint weekly_assignments_restaurant_id_week_start_template_id_dia_key;
-- One person per (turno, day, puesto); legacy rows have puesto_id null and
-- `nulls not distinct` keeps them unique too (PostgREST upserts need a
-- constraint as arbiter).
alter table weekly_assignments
  add constraint weekly_assignments_cell_key
  unique nulls not distinct (restaurant_id, week_start, template_id, dia_idx, puesto_id);

-- =============================================================================
-- RLS — read = visible restaurant, write = admin of the org (shape of 0009)
-- =============================================================================
alter table puestos          enable row level security;
alter table template_puestos enable row level security;

create policy "puestos read visible" on puestos for select
  using (restaurant_id in (select public.visible_restaurants()));
create policy "puestos admin write" on puestos for all
  using (public.current_role() = 'admin' and restaurant_id in
         (select id from restaurants where organization_id = public.current_org()))
  with check (public.current_role() = 'admin' and restaurant_id in
         (select id from restaurants where organization_id = public.current_org()));

create policy "template_puestos read visible" on template_puestos for select
  using (template_id in (select id from checklist_templates
                          where restaurant_id in (select public.visible_restaurants())));
create policy "template_puestos admin write" on template_puestos for all
  using (public.current_role() = 'admin' and template_id in
         (select id from checklist_templates where restaurant_id in
           (select id from restaurants where organization_id = public.current_org())))
  with check (public.current_role() = 'admin' and template_id in
         (select id from checklist_templates where restaurant_id in
           (select id from restaurants where organization_id = public.current_org())));
