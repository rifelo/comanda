-- =============================================================================
-- 0043 · Inventario: niveles por ítem y proveedores
-- =============================================================================
-- Hasta hoy un ítem solo tenía `stock_min`. Para que el barista (y la lista de
-- compras) sepan leer el stock hacen falta tres niveles y dónde se guarda:
--   stock_critico  rojo    · "se acabó": no alcanza para un día de venta
--   stock_min      amarillo · "poco": punto de pedido (ya existía)
--   stock_objetivo           · "pedir hasta": cuánto debe quedar tras comprar
--   ubicacion                · zona donde se cuenta (barra, nevera, bodega…)
--   pack_label               · cómo se llama la presentación ("bolsa", "caja")
--   controla_vencimiento     · si al recibirlo se anota la fecha de vencimiento
-- `proveedores` es a quién se le pide cada ítem (pedidos por WhatsApp).
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create table if not exists proveedores (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  -- Solo dígitos, con indicativo (57…): lo que espera wa.me.
  whatsapp        text,
  -- Texto libre: "lunes y jueves", "llega al día siguiente".
  dias_pedido     text,
  notas           text,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);
create unique index if not exists proveedores_org_name_idx
  on proveedores(organization_id, lower(name));

alter table proveedores enable row level security;
drop policy if exists "proveedores read org" on proveedores;
create policy "proveedores read org" on proveedores for select
  using (organization_id = public.current_org());
drop policy if exists "proveedores write admin" on proveedores;
create policy "proveedores write admin" on proveedores for all
  using (organization_id = public.current_org() and public.current_role() = 'admin')
  with check (organization_id = public.current_org() and public.current_role() = 'admin');

alter table ingredientes
  add column if not exists stock_critico numeric(12, 3) not null default 0 check (stock_critico >= 0);
alter table ingredientes
  add column if not exists stock_objetivo numeric(12, 3) check (stock_objetivo is null or stock_objetivo > 0);
alter table ingredientes add column if not exists ubicacion text;
alter table ingredientes add column if not exists pack_label text;
alter table ingredientes
  add column if not exists proveedor_id uuid references proveedores(id) on delete set null;
alter table ingredientes
  add column if not exists controla_vencimiento boolean not null default false;

notify pgrst, 'reload schema';
