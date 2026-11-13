-- A turno task tied to another part of the app: it is not ticked by hand,
-- it completes itself when that work is done. First (and only) link:
-- 'verificar_insumos' = the inventory verification of the day (agente_tareas)
-- has nothing pending; while something is pending the task stays open.

alter table template_tasks
  add column if not exists vinculo text
    check (vinculo is null or vinculo in ('verificar_insumos'));

comment on column template_tasks.vinculo is
  'verificar_insumos: la tarea se marca sola cuando no queda ningún insumo por verificar hoy (agente_tareas pendientes); no se marca a mano.';

notify pgrst, 'reload schema';
