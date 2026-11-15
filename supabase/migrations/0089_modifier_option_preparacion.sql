-- =============================================================================
-- 0089 · Una opción de modificador puede traer su preparación
-- =============================================================================
-- «Cold foam de matcha» no es solo insumos: el matcha se disuelve en agua
-- caliente, se enfría 5 min en el congelador y luego se bate con el Rich's.
-- `preparacion` guarda esos pasos (uno por línea); la comanda los imprime en
-- la capa donde caen los insumos de la opción (Espuma, para un cold foam).
-- Aditiva e idempotente.
-- =============================================================================
alter table modifier_options
  add column if not exists preparacion text
  check (preparacion is null or char_length(preparacion) <= 600);

comment on column modifier_options.preparacion is
  'Pasos de preparación de la opción (uno por línea); la comanda los imprime con sus insumos.';

notify pgrst, 'reload schema';
