-- =============================================================================
-- 0034 · Productos — pasos de preparación
-- =============================================================================
-- La receta guardaba solo los ingredientes. `preparacion` es texto libre, un
-- paso por línea, escrito desde Operación → Recetas; la ficha de receta del
-- POS (pulsación larga sobre el producto) lo muestra numerado.
-- Idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table productos add column if not exists preparacion text;
comment on column productos.preparacion is 'Pasos de preparación, uno por línea; lo muestra la ficha de receta del POS.';
