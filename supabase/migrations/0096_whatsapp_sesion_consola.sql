-- Agente de WhatsApp en la consola de Claude (Managed Agents): cada
-- conversación de WhatsApp usa una sesión del agente, que guarda su propio
-- historial. Se reutiliza mientras el chat esté activo; tras 1 h de silencio
-- empieza otra.
alter table whatsapp_conversaciones
  add column if not exists agente_sesion_id text,
  add column if not exists agente_sesion_at timestamptz;

notify pgrst, 'reload schema';
