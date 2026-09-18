-- =============================================================================
-- 0029 · Producto categorías — which ones print a cup label
-- =============================================================================
-- 0027 called this "es_bebida", but what it really decides is whether the POS
-- prints the menu label for a product. Bottled drinks handed over as they are
-- (agua, Bretaña, kombucha) are drinks and still don't need one, so the flag
-- is renamed to what it does and turned off for that category.
-- =============================================================================
alter table producto_categorias rename column es_bebida to imprime_etiqueta;
