-- Lo que los clientes mandan por WhatsApp (fotos, comprobantes, archivos):
-- se descarga al llegar al bucket privado «whatsapp-media» (Supabase
-- Storage) y queda ligado a su mensaje, para verlo en el POS y en el admin.
alter table whatsapp_mensajes
  add column if not exists media_path text,
  add column if not exists media_mime text;

notify pgrst, 'reload schema';
