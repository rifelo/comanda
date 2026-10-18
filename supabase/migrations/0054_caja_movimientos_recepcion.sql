-- =============================================================================
-- 0054 · Caja: ingresos y salidas · Compras: recepción en la tablet
-- =============================================================================
-- 1. caja_movimientos: la plata que entra o sale del cajón sin ser una venta
--    (el sencillo que se deposita para operar, el pago en efectivo de un pedido
--    que llegó). Siempre con justificación y firmado por quien estaba en la
--    tablet. El arqueo los cuenta: esperado = base + efectivo del POS +
--    ingresos − salidas de la ventana del turno (snapshot en caja_cierres).
-- 2. compras: lo que el barista registra al recibir un pedido — conteo por
--    línea (compra_items.qty_recibida ya existe), foto de lo recibido, foto de
--    la factura, total de la factura y cómo se pagó. Si se pagó con efectivo
--    de la caja, la salida queda enlazada (caja_movimiento_id).
-- 3. bucket privado «compras-fotos»: solo el rol de servicio sube y firma.
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create table if not exists caja_movimientos (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  restaurant_id     uuid references restaurants(id) on delete set null,
  shift_instance_id uuid references shift_instances(id) on delete set null,
  tipo              text not null check (tipo in ('ingreso', 'salida')),
  monto_cop         int not null check (monto_cop > 0),
  motivo            text not null check (motivo in ('sencillo', 'aporte', 'pago_pedido', 'compra_menor', 'retiro', 'otro')),
  justificacion     text not null check (char_length(btrim(justificacion)) >= 5),
  compra_id         uuid references compras(id) on delete set null,
  registered_by     uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists caja_movimientos_sede_fecha_idx on caja_movimientos(restaurant_id, created_at desc);
create index if not exists caja_movimientos_org_fecha_idx on caja_movimientos(organization_id, created_at desc);

alter table caja_movimientos enable row level security;
drop policy if exists "caja movimientos read org" on caja_movimientos;
create policy "caja movimientos read org" on caja_movimientos for select
  using (organization_id = public.current_org());
drop policy if exists "caja movimientos write admin" on caja_movimientos;
create policy "caja movimientos write admin" on caja_movimientos for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

alter table caja_cierres add column if not exists ingresos_cop int not null default 0 check (ingresos_cop >= 0);
alter table caja_cierres add column if not exists salidas_cop  int not null default 0 check (salidas_cop >= 0);
comment on column caja_cierres.esperado_cop is 'base_inicial + efectivo del POS + ingresos − salidas de caja en la ventana (snapshot al enviar).';

alter table compras add column if not exists recibido_foto_path text;
alter table compras add column if not exists factura_foto_path  text;
alter table compras add column if not exists factura_total_cop  int check (factura_total_cop is null or factura_total_cop >= 0);
alter table compras add column if not exists pago_metodo        text check (pago_metodo is null or pago_metodo in ('efectivo_caja', 'transferencia', 'pendiente'));
alter table compras add column if not exists caja_movimiento_id uuid references caja_movimientos(id) on delete set null;
alter table compras add column if not exists recibido_nota      text;

insert into storage.buckets (id, name, public)
values ('compras-fotos', 'compras-fotos', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
