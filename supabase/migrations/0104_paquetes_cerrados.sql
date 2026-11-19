-- Items counted only as closed packages (ice: bags of 3 kg). Sales still take
-- grams per drink; at the count the team types only the closed packages and
-- one open package is assumed in use, so any stock between the closed ones and
-- one package more agrees with the count (conteoConAbierto).
alter table ingredientes
  add column if not exists solo_cerrados boolean not null default false;

comment on column ingredientes.solo_cerrados is
  'Counted only as closed packages (pack_qty); one open package is assumed in use when comparing the count.';
