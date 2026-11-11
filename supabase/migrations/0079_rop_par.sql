-- ROP vs PAR (2026-11-11): punto_reorden is the ROP (when to order:
-- consumo × entrega + seguridad); par_nivel is the PAR (up to how much:
-- consumo × (entrega + días entre pedidos) + seguridad). ciclo_dias = days
-- between orders, from the supplier's fixed order days (7 if none).
alter table agente_estado_insumo
  add column if not exists ciclo_dias int,
  add column if not exists par_nivel numeric;

comment on column agente_estado_insumo.punto_reorden is 'ROP: order when the stock reaches this (consumo × entrega + seguridad).';
comment on column agente_estado_insumo.par_nivel is 'PAR: target level an order fills up to (consumo × (entrega + ciclo) + seguridad; masivos: ROP + lote).';
comment on column agente_estado_insumo.ciclo_dias is 'Days between orders to the supplier (longest gap between its order weekdays; 7 if none).';

notify pgrst, 'reload schema';
