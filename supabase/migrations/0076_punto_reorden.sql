-- Punto de reorden (PAR) por insumo, calculado por el asistente (2026-11-11).
--
-- PAR = consumo diario promedio × (días de entrega del proveedor + días de
-- seguridad). Seguridad: 3 días, o 10 para los de compra masiva (un lote que
-- alcanza para 30 días o más, p. ej. 5.000 vasos), salvo que el dueño fije
-- otro valor en el insumo. Por ahora el asistente solo calcula y avisa; a
-- futuro esto disparará la orden de compra.

alter table ingredientes
  add column if not exists dias_seguridad int check (dias_seguridad is null or dias_seguridad between 0 and 90);
comment on column ingredientes.dias_seguridad is 'Safety stock in days pinned by the owner; null = automatic (3, or 10 for bulk items).';

create table if not exists agente_estado_insumo (
  ingrediente_id   uuid primary key references ingredientes(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  consumo_diario   numeric(14, 3) not null default 0,  -- stock units per selling day (ventas + mermas, last 28 days)
  dias_con_venta   int not null default 0,              -- selling days in the window
  entrega_dias     int not null default 1,
  sin_proveedor    boolean not null default false,
  seguridad_dias   int not null default 3,
  punto_reorden    numeric(14, 3) not null default 0,
  lote             numeric(14, 3),                      -- what is usually bought at once (last 180 days), else the pack
  lote_origen      text check (lote_origen is null or lote_origen in ('compras', 'presentacion')),
  masivo           boolean not null default false,
  stock            numeric(14, 3) not null default 0,   -- snapshot when computed
  cobertura_dias   numeric(10, 1),                      -- stock / consumo
  pedir            boolean not null default false,      -- stock at or under the PAR
  cantidad_sugerida numeric(14, 3),
  updated_at       timestamptz not null default now()
);
create index if not exists agente_estado_insumo_org_idx on agente_estado_insumo(organization_id);

alter table agente_estado_insumo enable row level security;
drop policy if exists "agente_estado read org" on agente_estado_insumo;
create policy "agente_estado read org" on agente_estado_insumo for select
  using (organization_id = public.current_org());
drop policy if exists "agente_estado admin write" on agente_estado_insumo;
create policy "agente_estado admin write" on agente_estado_insumo for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

comment on table agente_estado_insumo is 'Per-item numbers of the inventory assistant: daily consumption, reorder point (PAR), lot, bulk flag, coverage.';

notify pgrst, 'reload schema';
