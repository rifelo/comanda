-- =============================================================================
-- 0062 · Módulo Caja en el tablet: más motivos, detalle, foto y anulación
-- =============================================================================
-- La pantalla /turno/caja reúne arqueo, entradas y salidas. Cada movimiento
-- sigue llevando su «¿por qué?» (justificacion) y ahora además:
--   · motivos nuevos: domicilio (pago al domiciliario), consignacion (plata
--     que se lleva al banco), devolucion (sobró de una compra).
--   · detalle jsonb: lo propio de cada motivo — plataforma y n.º de orden del
--     domicilio, quién lleva la consignación, las piezas del sencillo.
--   · foto_path: la factura, el comprobante o el recibo (bucket «caja-fotos»).
--     Una consignación sin comprobante queda «por confirmar».
--   · anulado_at/by/motivo: anular no borra; el arqueo deja de contarlo y el
--     dueño lo ve tachado.
--   · client_ref: el tablet guarda sin internet y reintenta; el índice único
--     hace que el reintento no duplique.
-- Idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table caja_movimientos drop constraint if exists caja_movimientos_motivo_check;
alter table caja_movimientos add constraint caja_movimientos_motivo_check
  check (motivo in ('sencillo', 'aporte', 'devolucion', 'pago_pedido', 'domicilio', 'consignacion', 'compra_menor', 'retiro', 'otro'));

alter table caja_movimientos add column if not exists detalle        jsonb not null default '{}'::jsonb;
alter table caja_movimientos add column if not exists foto_path      text;
alter table caja_movimientos add column if not exists anulado_at     timestamptz;
alter table caja_movimientos add column if not exists anulado_by     uuid references profiles(id) on delete set null;
alter table caja_movimientos add column if not exists anulado_motivo text;
alter table caja_movimientos add column if not exists client_ref     uuid;

create unique index if not exists caja_movimientos_client_ref_key on caja_movimientos(organization_id, client_ref) where client_ref is not null;

comment on column caja_movimientos.detalle    is 'Lo propio del motivo: {plataforma, orden} domicilio · {quien} consignación · {denominaciones:[{valor,cantidad}]} sencillo.';
comment on column caja_movimientos.foto_path  is 'Foto en el bucket caja-fotos (factura, comprobante, recibo). Consignación sin foto = por confirmar.';
comment on column caja_movimientos.anulado_at is 'Anulado desde el tablet: no se borra, el arqueo deja de contarlo.';
comment on column caja_movimientos.client_ref is 'Id que pone el tablet al registrar (también sin internet); evita duplicados al reintentar.';

-- Bucket privado: solo el rol de servicio sube y firma (igual que compras-fotos).
insert into storage.buckets (id, name, public)
values ('caja-fotos', 'caja-fotos', false)
on conflict (id) do nothing;
