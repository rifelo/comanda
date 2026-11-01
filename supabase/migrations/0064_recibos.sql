-- Recibos y comandas en papel (impresora térmica 80 mm, 01-nov-2026).
--
-- · organizations.recibo_encabezado: líneas bajo el nombre en el recibo del
--   cliente (NIT, dirección, teléfono…), texto libre.
-- · organizations.recibo_pie: el cierre del recibo («¡Gracias…!», wifi…).
-- · pos_print_jobs.clase: la cola de impresión ahora lleva dos clases —
--   'etiqueta' (Niimbot, como siempre) y 'ticket' (recibo/comanda para la
--   impresora de recibos) — y cada estación reclama solo la suya.

alter table organizations add column if not exists recibo_encabezado text
  check (char_length(recibo_encabezado) <= 300);
alter table organizations add column if not exists recibo_pie text
  check (char_length(recibo_pie) <= 200);

alter table pos_print_jobs add column if not exists clase text not null default 'etiqueta'
  check (clase in ('etiqueta', 'ticket'));
drop index if exists pos_print_jobs_queue_idx;
create index if not exists pos_print_jobs_queue_idx
  on pos_print_jobs(organization_id, clase, status, created_at);

comment on column organizations.recibo_encabezado is 'Líneas del encabezado del recibo impreso (NIT, dirección, teléfono).';
comment on column organizations.recibo_pie is 'Pie del recibo impreso.';
comment on column pos_print_jobs.clase is 'etiqueta = impresora de etiquetas; ticket = recibo/comanda en la impresora de recibos.';
