-- =============================================================================
-- 0018 · Ingredientes pack-purchase costing
-- =============================================================================
-- Lets an ingrediente's per-unit cost be derived from a bulk purchase instead
-- of typed by hand: store what was paid for a pack (`pack_cost_cop`) and how
-- many units it contains (`pack_qty`), and `cost_cop` becomes
-- round(pack_cost_cop / pack_qty). Both columns are nullable — existing rows
-- that carry a manual per-unit cost keep working unchanged (both null = manual
-- entry). `cost_cop` stays the source of truth so recetas need no changes.
-- Example: a pack of 12 vasos at 4.400 COP -> pack_cost_cop=4400, pack_qty=12,
-- cost_cop=367.
-- =============================================================================

alter table ingredientes
  add column pack_cost_cop int,
  add column pack_qty numeric(12, 3),
  add constraint ingredientes_pack_cost_positive
    check (pack_cost_cop is null or pack_cost_cop >= 0),
  add constraint ingredientes_pack_qty_positive
    check (pack_qty is null or pack_qty > 0);
