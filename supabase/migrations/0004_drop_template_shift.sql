-- =============================================================================
-- 0004 · drop the day/night shift kind from checklist_templates
-- =============================================================================
-- The day/night `shift` field on plantillas was purely cosmetic: the cron
-- generates one shift_instance per active template per day regardless of
-- this value, and admins build their own templates per restaurant so a
-- forced day/night split was friction without a payoff. Dropping the
-- column (and the enum, which has no other consumers) so the schema
-- reflects how the app actually works.
-- =============================================================================

alter table checklist_templates drop column shift;
drop type shift_kind;
