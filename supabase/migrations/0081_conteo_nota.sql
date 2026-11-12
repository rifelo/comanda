-- A counting rule per insumo, shown on the tablet while counting it
-- (e.g. Niimbot labels: count rolls; the one in the printer counts if it has
-- more than half left).
alter table ingredientes
  add column if not exists conteo_nota text
    check (conteo_nota is null or char_length(conteo_nota) <= 240);

comment on column ingredientes.conteo_nota is
  'Regla para contar este insumo; la tablet la muestra en «Verificar inventario».';

notify pgrst, 'reload schema';
