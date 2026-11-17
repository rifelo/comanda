-- Pedidos de WhatsApp paso a paso en el POS (diseño «Pedidos WhatsApp · POS
-- paso a paso», 17-nov): un paso «listo» entre preparar y despachar.
--   recoger   → listo = esperando que el cliente pase (se le avisa)
--   domicilio → listo = esperando al domiciliario
alter table ordenes drop constraint if exists ordenes_wa_estado_check;
alter table ordenes add constraint ordenes_wa_estado_check
  check (wa_estado in ('por_aceptar', 'aceptado', 'esperando_pago', 'en_preparacion', 'listo', 'en_camino', 'rechazado'));
alter table ordenes add column if not exists wa_listo_at timestamptz;

notify pgrst, 'reload schema';
