-- Pedidos por WhatsApp: el café los acepta o los rechaza desde el POS.
-- Al aceptar, el agente le confirma al cliente que ya están preparando su
-- pedido; al rechazar, el barista deja siempre un motivo (faltan insumos,
-- problema técnico, mucha demanda u otro) y el agente se lo explica al
-- cliente con una alternativa. Solo aplica a pedidos con canal 'whatsapp'.
alter table ordenes
  add column if not exists wa_estado text
    check (wa_estado in ('por_aceptar', 'aceptado', 'rechazado')),
  add column if not exists wa_decidido_at     timestamptz,
  add column if not exists wa_motivo          text,
  add column if not exists wa_motivo_detalle  text;

create index if not exists ordenes_wa_por_aceptar_idx
  on ordenes (organization_id, created_at) where wa_estado = 'por_aceptar';

notify pgrst, 'reload schema';
