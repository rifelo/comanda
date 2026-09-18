-- =============================================================================
-- 0028 · Organizations — brand illustration for the Instagram (QR) label
-- =============================================================================
-- Line art printed above the QR on the "síguenos" label (the cup drawing for
-- Cafe PA'YO). Null = the label prints without it.
-- =============================================================================
alter table organizations add column if not exists cup_url text;
