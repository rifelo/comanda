-- =============================================================================
-- 0046 · Inventario: la rutina del conteo
-- =============================================================================
-- El conteo pasa a ser parte del cierre: rápido cada noche, completo un día
-- fijo de la semana. `conteo_completo_dia` es ese día con la convención del
-- resto del sistema (lun = 0 … dom = 6). Un conteo rápido cuyas diferencias
-- son normales corrige el stock solo, sin esperar al dueño: `auto` lo marca
-- (aprobado sin `reviewed_by`) para que se pueda auditar después.
-- Aditiva e idempotente.
-- =============================================================================
alter table organizations
  add column if not exists conteo_completo_dia smallint not null default 6
    check (conteo_completo_dia between 0 and 6);

alter table inventario_conteos
  add column if not exists auto boolean not null default false;
