-- =============================================================================
-- 0036 · Ingredient cost with decimals
-- =============================================================================
-- Ingredients measured in g / ml cost a fraction of a peso per unit (milk at
-- 3.250 COP per 900 ml bag is 3,61 COP/ml). `cost_cop` was an int, so the
-- per-unit cost rounded to 4 and every recipe carrying milk was costed 11 %
-- too high. The three cost snapshots become numeric(12, 2); recipe totals and
-- productos.cost_cop stay whole pesos (rounded by the app).
-- Idempotent: altering to the same type is a no-op.
-- =============================================================================

alter table ingredientes
  alter column cost_cop type numeric(12, 2);

alter table ingrediente_movements
  alter column unit_cost_cop type numeric(12, 2);

alter table inventario_conteo_items
  alter column unit_cost_cop type numeric(12, 2);

comment on column ingredientes.cost_cop is
  'Cost per base unit, up to 2 decimals (g / ml ingredients cost fractions of a peso). When bought by pack: pack_cost_cop / pack_qty.';
