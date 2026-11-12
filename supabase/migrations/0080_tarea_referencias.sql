-- Reference pictures on a turno task (e.g. the grinder screen for a single and
-- a double espresso): the tablet shows them when the task is opened.
alter table template_tasks
  add column if not exists referencias jsonb
    check (referencias is null or jsonb_typeof(referencias) = 'array');

comment on column template_tasks.referencias is
  'Fotos de referencia: [{"url": "/referencias/x.webp", "titulo": "Espresso sencillo"}]; la tablet las muestra al abrir la tarea.';

notify pgrst, 'reload schema';
