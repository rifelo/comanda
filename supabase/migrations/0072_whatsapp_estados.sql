-- Estado de entrega de cada mensaje que enviamos por WhatsApp (sent →
-- delivered → read, o failed con el motivo de Meta). Llega por el webhook
-- como «statuses»; los registros de Vercel duran muy poco para revisarlo ahí.
alter table public.whatsapp_mensajes
  add column if not exists estado text check (estado in ('sent', 'delivered', 'read', 'failed')),
  add column if not exists error text,
  add column if not exists estado_at timestamptz;
