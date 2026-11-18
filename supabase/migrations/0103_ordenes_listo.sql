-- «Caja» board in the POS: an in-store order goes Preparar → Listo → Entregado.
-- listo_at marks when the barista tapped «Ya está listo» (null = still being made).
alter table ordenes add column if not exists listo_at timestamptz;
notify pgrst, 'reload schema';
