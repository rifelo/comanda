-- =============================================================================
-- 0027 · Producto categorías — which ones are drinks
-- =============================================================================
-- The POS prints a cup label (the "Café PA'YO" design) for drinks only, never
-- for food. A category is not a drink unless flagged, so a new "Sandwiches"
-- never starts printing cup labels by itself. Products with no category fall
-- back to "has coffee in the recipe" (see lib/pos/catalog.ts).
-- =============================================================================
alter table producto_categorias
  add column if not exists es_bebida boolean not null default false;
