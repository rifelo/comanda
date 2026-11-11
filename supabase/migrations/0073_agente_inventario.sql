-- Agente de inventario (docs/agente-inventario/PLAN.md, F2).
--
-- The assistant decides WHAT to count and WHEN; the team only counts what it
-- asks for on the /turno tablet. The end-of-shift counts (diario / completo)
-- are retired from the routine — their rows stay for history.
--
--   agente_config   one row per org: which reasons the assistant may count for
--                   (owner toggles in /inventario/conteos) and how many items a
--                   turno gets at most.
--   agente_tareas   one row per item to verify: why (motivo), for which day,
--                   what the barista answered, and the count line it produced.
--   inventario_conteos.kind gains 'agente' (one count per batch/day).
--   inventario_conteo_items gains a per-line review: an ordinary line applies
--   by itself, an odd one waits for a second verification.

-- ── config ──────────────────────────────────────────────────────────────
create table if not exists agente_config (
  organization_id  uuid primary key references organizations(id) on delete cascade,
  regla_mas_vendido   boolean not null default true,
  regla_aviso         boolean not null default true,
  regla_antes_pedir   boolean not null default true,
  regla_sin_contar    boolean not null default true,
  max_por_turno       int not null default 5 check (max_por_turno between 1 and 15),
  -- days without a count before «sin contar» picks an item up
  dias_sin_contar     int not null default 14 check (dias_sin_contar between 3 and 60),
  -- last day the planner ran for (idempotency of the nightly / lazy run)
  ultimo_plan         date,
  updated_at          timestamptz not null default now()
);

alter table agente_config enable row level security;
drop policy if exists "agente_config read org" on agente_config;
create policy "agente_config read org" on agente_config for select
  using (organization_id = public.current_org());
drop policy if exists "agente_config admin write" on agente_config;
create policy "agente_config admin write" on agente_config for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

-- ── tasks ───────────────────────────────────────────────────────────────
create table if not exists agente_tareas (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  restaurant_id    uuid references restaurants(id) on delete set null,
  ingrediente_id   uuid not null references ingredientes(id) on delete cascade,
  -- why the assistant asks (shown to the owner; the barista only sees the item)
  motivo           text not null check (motivo in ('mas_vendido', 'aviso', 'antes_pedir', 'sin_contar', 'manual', 'segunda')),
  -- one line of evidence: «862 g · 31 pedidos», «Estiben marcó poco»…
  detalle          text,
  prioridad        numeric not null default 0,
  -- the day the task is for (sede's local date)
  fecha            date not null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'no_encontrado', 'vencida', 'cancelada')),
  conteo_id        uuid references inventario_conteos(id) on delete set null,
  hecha_por        uuid references profiles(id) on delete set null,
  hecha_at         timestamptz,
  creada_por       uuid references profiles(id) on delete set null,  -- null = the assistant
  created_at       timestamptz not null default now()
);
create index if not exists agente_tareas_org_fecha_idx on agente_tareas(organization_id, fecha desc);
-- at most one open task per item
create unique index if not exists agente_tareas_una_abierta
  on agente_tareas(organization_id, ingrediente_id) where estado = 'pendiente';

alter table agente_tareas enable row level security;
drop policy if exists "agente_tareas read org" on agente_tareas;
create policy "agente_tareas read org" on agente_tareas for select
  using (organization_id = public.current_org());
drop policy if exists "agente_tareas admin write" on agente_tareas;
create policy "agente_tareas admin write" on agente_tareas for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

-- ── counts made for the assistant ───────────────────────────────────────
alter table inventario_conteos drop constraint if exists inventario_conteos_kind_check;
alter table inventario_conteos
  add constraint inventario_conteos_kind_check check (kind in ('diario', 'completo', 'agente'));

-- per-line review: 'aplicado' (its ajuste is in the stock), 'revisar' (waits
-- for a second verification), 'rechazado' (owner discarded it). Null on the
-- older counts, which are reviewed as a whole.
alter table inventario_conteo_items
  add column if not exists revision text check (revision is null or revision in ('aplicado', 'revisar', 'rechazado'));
alter table inventario_conteo_items
  add column if not exists tarea_id uuid references agente_tareas(id) on delete set null;

-- service-role writes from the tablet need nothing more; the owner updates
-- lines from the panel.
drop policy if exists "conteo items admin update" on inventario_conteo_items;
create policy "conteo items admin update" on inventario_conteo_items for update
  using (public.current_role() = 'admin' and exists (select 1 from inventario_conteos c where c.id = conteo_id and c.organization_id = public.current_org()))
  with check (public.current_role() = 'admin' and exists (select 1 from inventario_conteos c where c.id = conteo_id and c.organization_id = public.current_org()));

comment on table agente_tareas is 'Items the inventory assistant asks the team to verify (count) on the tablet.';
comment on table agente_config is 'Inventory assistant settings per org: which reasons it may count for.';

notify pgrst, 'reload schema';
