-- Flujo de pedidos por WhatsApp (dueño, 17-nov):
--   el barista acepta → si es domicilio, el admin aprueba el pago en el
--   panel → el pedido entra a preparación y se imprime la comanda → «Salió
--   con el domiciliario». Los pedidos para recoger pasan directo a
--   preparación (se pagan en el café).
-- `aceptado` queda solo por pedidos anteriores a este cambio.
alter table ordenes drop constraint if exists ordenes_wa_estado_check;
alter table ordenes add constraint ordenes_wa_estado_check
  check (wa_estado in ('por_aceptar', 'aceptado', 'esperando_pago', 'en_preparacion', 'en_camino', 'rechazado'));

alter table ordenes
  add column if not exists wa_pago_aprobado_at  timestamptz,
  add column if not exists wa_pago_aprobado_por uuid references profiles(id) on delete set null,
  add column if not exists wa_en_camino_at      timestamptz,
  -- Una sola caja imprime la comanda: la que lo reclama primero.
  add column if not exists comanda_impresa_at   timestamptz;

create index if not exists ordenes_wa_esperando_pago_idx
  on ordenes (organization_id, created_at) where wa_estado = 'esperando_pago';

-- Domiciliarios del café: «Nombre número», uno por línea (Ajustes › Sede).
-- El POS abre WhatsApp con el pedido listo para enviárselo.
alter table organizations add column if not exists domiciliarios text;

notify pgrst, 'reload schema';
