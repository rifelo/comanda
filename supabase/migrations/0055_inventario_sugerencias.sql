-- =============================================================================
-- 0055 · Inventario: sugerencias del equipo por sección
-- =============================================================================
-- El conteo se recorre sección por sección (Barra, Nevera, Vitrina, Bodega,
-- Aseo, según ingredientes.ubicacion). Quien está en la barra ve primero lo
-- que no cuadra: un ítem que está en la nevera pero la lista lo pone en la
-- bodega, o algo que hay y la lista ni tiene. Desde la tablet lo sugiere; el
-- dueño lo aplica o lo descarta desde el panel.
--   · tipo 'ubicacion'  un ítem existente (ingrediente_id) va en `zona`
--   · tipo 'nuevo'      algo que falta en la lista (nombre, presentación)
--   · resultado_ingrediente_id  el ítem que quedó (creado o unido)
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create table if not exists inventario_sugerencias (
  id                       uuid primary key default uuid_generate_v4(),
  organization_id          uuid not null references organizations(id) on delete cascade,
  restaurant_id            uuid references restaurants(id) on delete set null,
  zona                     text not null check (zona in ('Aseo', 'Barra', 'Nevera', 'Vitrina', 'Bodega')),
  tipo                     text not null check (tipo in ('ubicacion', 'nuevo')),
  ingrediente_id           uuid references ingredientes(id) on delete cascade,
  nombre                   text,
  presentacion             text,
  nota                     text,
  status                   text not null default 'pendiente' check (status in ('pendiente', 'aplicada', 'descartada')),
  resultado_ingrediente_id uuid references ingredientes(id) on delete set null,
  sugerido_por             uuid references profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  resolved_by              uuid references profiles(id) on delete set null,
  resolved_at              timestamptz,
  check ((tipo = 'ubicacion' and ingrediente_id is not null) or (tipo = 'nuevo' and char_length(btrim(coalesce(nombre, ''))) >= 2))
);
create index if not exists inventario_sugerencias_open_idx on inventario_sugerencias(organization_id, created_at desc) where status = 'pendiente';

alter table inventario_sugerencias enable row level security;
drop policy if exists "sugerencias read org" on inventario_sugerencias;
create policy "sugerencias read org" on inventario_sugerencias for select
  using (organization_id = public.current_org());
drop policy if exists "sugerencias write admin" on inventario_sugerencias;
create policy "sugerencias write admin" on inventario_sugerencias for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

-- The label rolls (2026-10-18) were filed under a place the walked count doesn't visit.
update ingredientes set ubicacion = 'Barra' where ubicacion = 'Caja · impresora';

notify pgrst, 'reload schema';
