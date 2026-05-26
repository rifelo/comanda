-- =============================================================================
-- 0008 · Ingredientes dual-unit support
-- =============================================================================
-- Adds two optional columns so an ingrediente can carry a secondary unit
-- (e.g. `caja` primary + `und` secondary) plus a positive conversion factor
-- (e.g. 1 caja = 12 und). Both columns are nullable — existing single-unit
-- rows keep working unchanged. The check constraint ensures we never store a
-- non-positive factor; null is allowed (means "show secondary unit only,
-- without an automatic conversion").
-- =============================================================================

alter table ingredientes
  add column unit2 text,
  add column conversion_factor numeric,
  add constraint ingredientes_conversion_factor_positive
    check (conversion_factor is null or conversion_factor > 0);
