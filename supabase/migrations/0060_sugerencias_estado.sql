-- «¿Qué se está acabando?» on the tablet: something that is not on the list
-- is added already marked (poco / agotado), so the owner sees it in Por pedir
-- with how urgent it is. Same values as inventario_faltantes.estado; NULL for
-- the older suggestions (and «va en esta sección», which marks nothing).
alter table inventario_sugerencias
  add column if not exists estado text
    check (estado is null or estado in ('bajo', 'agotado'));

comment on column inventario_sugerencias.estado is
  'How the new item was when it was added from the tablet (bajo | agotado); null = not marked.';

notify pgrst, 'reload schema';
