-- =============================================================================
-- 0026 · Organizations — brand sticker label for the POS printer
-- =============================================================================
-- Public path (or URL) of a black-and-white brand image the POS can print as
-- a label ("Sticker PA'YO"). Null = the POS offers no sticker label.
-- =============================================================================
alter table organizations add column if not exists sticker_url text;
