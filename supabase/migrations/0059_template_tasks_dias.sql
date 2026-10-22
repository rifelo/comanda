-- Per-task weekdays: a turno's checklist task can run only on some days
-- (e.g. «Regar la pandurata» once a week). Same mask as checklist_templates.dias
-- (lun = 0 … dom = 6). NULL = every day the turno runs (all existing tasks).
alter table template_tasks
  add column if not exists dias boolean[]
    check (dias is null or array_length(dias, 1) = 7);

comment on column template_tasks.dias is
  'Weekdays the task applies (lun=0…dom=6); null = every day the turno runs.';
