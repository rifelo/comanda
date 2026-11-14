-- =============================================================================
-- 0088 · Versiones de receta (v1, v2…)
-- =============================================================================
-- Una bebida puede tener varias recetas guardadas (la de siempre y la v2 del
-- estándar de capas) y el dueño elige cuál se usa. La receta EN USO sigue
-- viviendo donde siempre (receta_items + productos.capas / referencia_visual /
-- price_cop), así que el POS, el descuento de inventario, los costos y los
-- reportes no cambian. Cada versión guarda una foto completa:
--   items = [{ ingrediente_id, qty, unit, note, position }]
-- Cambiar de versión = guardar la receta en uso en su versión y copiar la
-- elegida a receta_items (lib/db/receta-versiones.ts).
-- Aditiva e idempotente.
-- =============================================================================
create table if not exists receta_versiones (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  producto_id       uuid not null references productos(id) on delete cascade,
  nombre            text not null check (char_length(nombre) between 1 and 40),
  items             jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  capas             jsonb check (capas is null or jsonb_typeof(capas) = 'object'),
  referencia_visual text check (char_length(referencia_visual) <= 300),
  price_cop         integer check (price_cop is null or price_cop >= 0),
  nota              text check (char_length(nota) <= 300),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (producto_id, nombre)
);
create index if not exists receta_versiones_org_idx on receta_versiones(organization_id);
create index if not exists receta_versiones_producto_idx on receta_versiones(producto_id);

alter table productos add column if not exists receta_version_id uuid references receta_versiones(id) on delete set null;
comment on column productos.receta_version_id is 'La versión de receta en uso (receta_versiones); null = la receta de siempre, sin versiones.';

alter table receta_versiones enable row level security;
drop policy if exists "receta_versiones read org" on receta_versiones;
create policy "receta_versiones read org" on receta_versiones for select
  using (organization_id = public.current_org());
drop policy if exists "receta_versiones admin write" on receta_versiones;
create policy "receta_versiones admin write" on receta_versiones for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

notify pgrst, 'reload schema';
