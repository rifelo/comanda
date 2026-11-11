-- The assistant asks for every item that needs a check, not a fixed 5 per
-- turno (owner decision 2026-11-11). max_por_turno stays as an optional cap:
-- null = no cap.
alter table agente_config drop constraint if exists agente_config_max_por_turno_check;
alter table agente_config alter column max_por_turno drop not null;
alter table agente_config alter column max_por_turno drop default;
alter table agente_config
  add constraint agente_config_max_por_turno_check check (max_por_turno is null or max_por_turno between 1 and 200);
update agente_config set max_por_turno = null;

comment on column agente_config.max_por_turno is 'Optional cap on verification items per day; null = every item that needs it.';

notify pgrst, 'reload schema';
