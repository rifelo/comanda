-- =============================================================================
-- 0044 · Ingredientes: la pieza que se cuenta
-- =============================================================================
-- `pack_qty` es el lote de compra (la paca de 12 bolsas de leche = 10.800 ml)
-- y sirve para el costo. En el estante nadie cuenta pacas ni mililitros:
-- cuenta bolsas. `pieza_qty` es cuánto trae una pieza en la unidad de stock
-- (la bolsa de leche = 900 ml; la botella de ginger = 400 ml) y `pack_label`
-- (0043) es cómo se llama. Con eso el conteo es "7 bolsas + 300 ml" y los
-- niveles se leen "Poco: 2 bolsas o menos". Nulo = se cuenta en la unidad.
-- Aditiva e idempotente.
-- =============================================================================
alter table ingredientes
  add column if not exists pieza_qty numeric(12, 3) check (pieza_qty is null or pieza_qty > 0);

notify pgrst, 'reload schema';
