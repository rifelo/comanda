-- Confiabilidad del PAR por insumo (2026-11-11): how far each reorder point
-- can be trusted, so the future reposición/compra process knows which items
-- it may automate. Computed with the PAR every night.
alter table agente_estado_insumo
  add column if not exists confiabilidad text check (confiabilidad is null or confiabilidad in ('alta', 'media', 'baja', 'sin_datos')),
  add column if not exists confiabilidad_faltan text[] not null default '{}',
  add column if not exists dias_sin_contar int;

comment on column agente_estado_insumo.confiabilidad is 'How far the PAR can be trusted: alta (all checks pass), media (one fails), baja (two or more), sin_datos (no consumption).';
comment on column agente_estado_insumo.confiabilidad_faltan is 'What is missing for a reliable PAR, in Spanish, one line per failed check.';

notify pgrst, 'reload schema';
