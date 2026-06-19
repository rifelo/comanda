-- =============================================================================
-- 0017 · Productos description column
-- =============================================================================
-- Adds an optional free-text `description` to productos, written from the
-- catálogo's NuevoProductoDrawer. Nullable so every existing row stays
-- valid; no backfill needed.
-- =============================================================================

alter table productos add column description text;
