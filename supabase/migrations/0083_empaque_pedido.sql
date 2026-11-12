-- Empaque por pedido para llevar / domicilio.
--
-- A take-away or delivery order takes its packaging out of the inventory on
-- top of the recipes: cup holders and a kraft bag by the number of drinks
-- (2 → holder of 2 + medium bag; 3–4 → holder of 4 + large bag; more drinks
-- repeat the pattern) and one greaseproof bag per food item.
--
-- Which products are drinks or food is set per product category; which insumo
-- plays each packaging role is set on the insumo (one per role and org).

alter table producto_categorias
  add column if not exists empaque text check (empaque is null or empaque in ('bebida', 'comida'));

comment on column producto_categorias.empaque is
  'Para el empaque de pedidos para llevar/domicilio: bebida (va en portavasos) o comida (bolsa antigrasa). Null = no cuenta.';

alter table ingredientes
  add column if not exists empaque_rol text check (
    empaque_rol is null or empaque_rol in ('portavasos_2', 'portavasos_4', 'bolsa_mediana', 'bolsa_grande', 'bolsa_comida')
  );

create unique index if not exists ingredientes_empaque_rol_idx
  on ingredientes(organization_id, empaque_rol) where empaque_rol is not null and archived = false;

comment on column ingredientes.empaque_rol is
  'Papel en el empaque de pedidos para llevar/domicilio: portavasos_2, portavasos_4, bolsa_mediana, bolsa_grande, bolsa_comida.';

notify pgrst, 'reload schema';
