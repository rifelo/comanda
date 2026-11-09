-- =============================================================================
-- 0071 · Una opción puede CAMBIAR un insumo de la receta por otro
-- =============================================================================
-- «Leche: Deslactosada» no suma una cantidad fija: usa leche deslactosada en
-- lugar de la entera, en la cantidad que lleve cada bebida (250 ml un latte,
-- 180 ml un cappuccino). Con `reemplaza_id`, la fila dice «este insumo en lugar
-- de aquel»: lo que la receta lleve de `reemplaza_id` (× qty, normalmente 1)
-- se descuenta de `ingrediente_id`.
-- =============================================================================
alter table modifier_option_receta
  add column if not exists reemplaza_id uuid references ingredientes(id) on delete cascade;
comment on column modifier_option_receta.reemplaza_id is
  'Si está: la opción usa ingrediente_id EN LUGAR DE reemplaza_id, en la cantidad de la receta × qty.';
