-- =============================================================================
-- 0023 · Organizations — Instagram handle for the POS "síguenos" QR label
-- =============================================================================
-- Stored without the "@" ("cafepayo"). Null = the POS offers no Instagram
-- label. Readable through the existing organizations RLS (org members);
-- edited by admins for now via the service role until Configuración gets a
-- field for it.
-- =============================================================================
alter table organizations add column if not exists instagram text;
