-- =============================================================================
-- 0048 · Modificadores que consumen inventario
-- =============================================================================
-- Hasta hoy una opción de modificador solo cambiaba el precio. Hay bebidas en
-- las que la opción ES un ingrediente: un jugo «en leche» gasta 200 ml de
-- leche y «en agua» 210 ml de agua. `modifier_option_receta` es la receta de
-- la opción: lo que se descuenta, por unidad vendida, cuando se elige.
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create table if not exists modifier_option_receta (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  option_id       uuid not null references modifier_options(id) on delete cascade,
  ingrediente_id  uuid not null references ingredientes(id) on delete cascade,
  qty             numeric(12, 3) not null check (qty > 0),
  unique (option_id, ingrediente_id)
);
create index if not exists modifier_option_receta_org_idx on modifier_option_receta(organization_id);

alter table modifier_option_receta enable row level security;
drop policy if exists "mod option receta read org" on modifier_option_receta;
create policy "mod option receta read org" on modifier_option_receta for select
  using (organization_id = public.current_org());
drop policy if exists "mod option receta write admin" on modifier_option_receta;
create policy "mod option receta write admin" on modifier_option_receta for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

notify pgrst, 'reload schema';
