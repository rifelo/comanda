-- =============================================================================
-- 0087 · Ficha técnica por capas
-- =============================================================================
-- Todas las bebidas se preparan con el mismo patrón de 8 capas, en orden fijo:
-- Vaso · Fondo · Hielo · Cuerpo · Protagonista · Espuma · Decoración · Cierre.
-- Cada capa tiene sus insumos (con la cantidad de esa capa: la leche se reparte
-- entre el cuerpo y la espuma), una o varias operaciones («Tapar + Servir») y
-- una nota verificable; varias capas seguidas pueden ir bajo una sola
-- operación («Licuar»). La forma la valida lib/recetas/capas.ts.
--   capas = { "capas": [{ capa, ops[], nota?, items: [{ ing, qty } | { texto, texto16? }] }],
--             "grupos": [{ desde, hasta, op, nota? }] }
-- `preparacion` (texto) sigue existiendo: se regenera desde las capas para la
-- comanda impresa y para las bebidas que aún no tienen capas.
-- Aditiva e idempotente.
-- =============================================================================
alter table productos add column if not exists capas jsonb;
alter table productos add column if not exists referencia_visual text;

do $$ begin
  alter table productos add constraint productos_referencia_visual_len check (char_length(referencia_visual) <= 300);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table productos add constraint productos_capas_obj check (capas is null or jsonb_typeof(capas) = 'object');
exception when duplicate_object then null; end $$;

comment on column productos.capas is 'Ficha técnica por capas (vaso, fondo, hielo, cuerpo, protagonista, espuma, decoracion, cierre) con operaciones y grupos; ver lib/recetas/capas.ts.';
comment on column productos.referencia_visual is 'Cómo debe verse la bebida terminada (encabezado de la ficha técnica).';

notify pgrst, 'reload schema';
