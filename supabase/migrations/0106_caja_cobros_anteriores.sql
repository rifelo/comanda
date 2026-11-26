-- «Por cobrar» (POS): an order left unpaid from an earlier day and paid later.
-- Its money is already inside the cierre's totals (cash is in the drawer); these
-- columns keep the part that paid earlier-day orders so the close shows it on
-- its own line («cobros de días anteriores») — the sale stays on its own day.
alter table caja_cierres
  add column if not exists anteriores_cop integer not null default 0,
  add column if not exists anteriores_efectivo_cop integer not null default 0;

comment on column caja_cierres.anteriores_cop is
  'Payments in this window for orders created on an earlier local day (all methods); already included in efectivo/tarjeta/transferencia.';
comment on column caja_cierres.anteriores_efectivo_cop is
  'Cash part of anteriores_cop; already included in efectivo_cop and esperado_cop.';
