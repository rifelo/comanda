-- =============================================================================
-- 0056 · Gastos del negocio
-- =============================================================================
-- Lo que cuesta operar y no es inventario ni sale del cajón: la comisión de
-- Bold por las transferencias, arriendo, servicios, nómina, publicidad…
-- Cada gasto pertenece a un día (fecha) y dice de qué cuenta salió. Lo que se
-- paga con efectivo de la caja sigue siendo una salida de caja (0054) para que
-- el arqueo cuadre; las compras de insumos van por compras/movimientos.
-- Solo el dueño registra y borra; el equipo no lo ve en la tablet.
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create table if not exists gastos (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  restaurant_id    uuid references restaurants(id) on delete set null,
  fecha            date not null,
  categoria        text not null check (categoria in ('comisiones', 'arriendo', 'servicios', 'nomina', 'mantenimiento', 'publicidad', 'impuestos', 'otro')),
  concepto         text not null check (char_length(btrim(concepto)) >= 3),
  -- Con centavos: las comisiones de Bold vienen con decimales.
  monto_cop        numeric(12, 2) not null check (monto_cop > 0),
  cuenta           text not null default 'bold' check (cuenta in ('bold', 'banco', 'efectivo', 'otra')),
  note             text,
  registered_by    uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists gastos_org_fecha_idx on gastos(organization_id, fecha desc);

alter table gastos enable row level security;
drop policy if exists "gastos read admin" on gastos;
create policy "gastos read admin" on gastos for select
  using (organization_id = public.current_org() and public.current_role() = 'admin');
drop policy if exists "gastos write admin" on gastos;
create policy "gastos write admin" on gastos for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');
