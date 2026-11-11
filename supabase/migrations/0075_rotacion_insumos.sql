-- Rotación de insumos + «vendido ayer» (owner decision 2026-11-11).
--
-- The assistant no longer verifies only the best sellers: it verifies every
-- item sold the day before. How often depends on the item's rotation:
--   alta  → every day it was sold the day before
--   baja  → when sold, at most once a week
-- Rotation is computed nightly from the last 14 days of sales (alta = sold on
-- half or more of the days the café sold anything) and the owner can pin it
-- by hand on the item.

alter table ingredientes
  add column if not exists rotacion text check (rotacion is null or rotacion in ('alta', 'baja')),
  add column if not exists rotacion_auto text check (rotacion_auto is null or rotacion_auto in ('alta', 'baja')),
  add column if not exists rotacion_dias int,
  add column if not exists rotacion_ventana int;

comment on column ingredientes.rotacion is 'Rotation pinned by the owner (alta | baja); null = use rotacion_auto.';
comment on column ingredientes.rotacion_auto is 'Rotation computed by the inventory assistant from the last 14 days of sales.';
comment on column ingredientes.rotacion_dias is 'Days with sales of this item in the last window (rotacion_ventana open days).';

-- the reason «más vendido» becomes «vendido ayer»
alter table agente_tareas drop constraint if exists agente_tareas_motivo_check;
alter table agente_tareas
  add constraint agente_tareas_motivo_check check (motivo in ('mas_vendido', 'vendido_ayer', 'aviso', 'antes_pedir', 'sin_contar', 'manual', 'segunda'));

do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'agente_config' and column_name = 'regla_mas_vendido') then
    alter table agente_config rename column regla_mas_vendido to regla_vendido_ayer;
  end if;
end $$;

notify pgrst, 'reload schema';
