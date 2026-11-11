-- A verification that expired without being counted comes back the next day
-- as «Pendiente de días anteriores» (owner decision 2026-11-11), instead of
-- waiting until the item meets another rule.
alter table agente_tareas drop constraint if exists agente_tareas_motivo_check;
alter table agente_tareas
  add constraint agente_tareas_motivo_check check (motivo in ('mas_vendido', 'vendido_ayer', 'aviso', 'antes_pedir', 'sin_contar', 'manual', 'segunda', 'pendiente'));

-- expired tasks are looked up by item when planning and in the owner's panel
create index if not exists agente_tareas_vencidas_idx on agente_tareas(organization_id, ingrediente_id) where estado = 'vencida';

notify pgrst, 'reload schema';
