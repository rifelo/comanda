-- Usuarios de WhatsApp (2026): un cliente puede escribir con @usuario y sin
-- mostrar su teléfono. Meta manda entonces un id por negocio (BSUID, «RS.…»)
-- en vez del número. Guardamos ambos para reconocerlo, y la ficha puede
-- cargarse de antemano solo con el @usuario: se enlaza al primer mensaje.
alter table whatsapp_conversaciones
  add column if not exists user_id  text,
  add column if not exists username text;

alter table whatsapp_clientes
  alter column wa_id drop not null,
  add column if not exists user_id  text,
  add column if not exists username text;

create unique index if not exists whatsapp_clientes_username_uq
  on whatsapp_clientes (organization_id, lower(username)) where username is not null;

notify pgrst, 'reload schema';
