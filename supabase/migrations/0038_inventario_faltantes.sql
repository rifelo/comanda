-- =============================================================================
-- 0038 · Inventario rápido: prioridad de ingredientes + faltantes reportados
-- =============================================================================
-- El barista abre "Faltantes" en el tablet, ve solo los ingredientes marcados
-- como prioritarios (ordenados por prioridad) y toca el estado de cada uno:
-- hay / poco / se acabó. Cada toque queda como un reporte; el último reporte
-- abierto de un ingrediente es su estado actual, y el dueño (o quien
-- reponga) lo resuelve. Un reporte "ok" nace resuelto: registra que se
-- revisó y cierra lo que hubiera abierto de ese ingrediente.
--   ingredientes.prioridad: 0 = fuera de la lista rápida, 1 = crítico
--   (sin esto no se vende), 2 = importante, 3 = normal.
-- Idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table ingredientes add column if not exists prioridad smallint not null default 0
  check (prioridad between 0 and 3);
create index if not exists ingredientes_prioridad_idx
  on ingredientes(organization_id, prioridad) where prioridad > 0 and archived = false;

create table if not exists inventario_faltantes (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  restaurant_id     uuid references restaurants(id) on delete set null,
  shift_instance_id uuid references shift_instances(id) on delete set null,
  ingrediente_id    uuid not null references ingredientes(id) on delete cascade,
  estado            text not null check (estado in ('ok', 'bajo', 'agotado')),
  -- stock que el sistema tenía al reportar (para comparar después)
  stock_sistema     numeric(12, 3),
  note              text,
  reported_by       uuid references profiles(id) on delete set null,
  reported_at       timestamptz not null default now(),
  resolved_by       uuid references profiles(id) on delete set null,
  resolved_at       timestamptz,
  resolved_note     text
);
create index if not exists inventario_faltantes_org_idx
  on inventario_faltantes(organization_id, reported_at desc);
create index if not exists inventario_faltantes_open_idx
  on inventario_faltantes(organization_id, ingrediente_id) where resolved_at is null;

alter table inventario_faltantes enable row level security;

drop policy if exists "faltantes read org" on inventario_faltantes;
create policy "faltantes read org" on inventario_faltantes for select
  using (organization_id = public.current_org());
drop policy if exists "faltantes insert org" on inventario_faltantes;
create policy "faltantes insert org" on inventario_faltantes for insert
  with check (organization_id = public.current_org());
-- Cualquier miembro puede resolver (quien repone el insumo lo cierra).
drop policy if exists "faltantes update org" on inventario_faltantes;
create policy "faltantes update org" on inventario_faltantes for update
  using (organization_id = public.current_org())
  with check (organization_id = public.current_org());

comment on column ingredientes.prioridad is '0 fuera de la lista rápida · 1 crítico · 2 importante · 3 normal.';
comment on table  inventario_faltantes    is 'Estados reportados desde el tablet (hay / poco / se acabó); el abierto es el estado actual.';
