-- =============================================================================
-- 0049 · Calificaciones del cliente y puntos por @ de Instagram
-- =============================================================================
-- El QR de la etiqueta del vaso abre un enlace de un solo uso
-- (cafepayo.com/c/<codigo>): cinco estrellas, una sugerencia opcional y, si el
-- cliente quiere, su @ de Instagram para acumular puntos y guardar su café.
--   calificaciones  un enlace por etiqueta impresa. Nace sin estrellas cuando
--                   el POS registra la venta; `usada_at` lo cierra para siempre.
--                   `items` es lo que pidió esa persona («su café»).
--   clientes        un cliente por @ en cada organización, con sus puntos.
-- La página pública y el POS escriben con service role desde server actions;
-- por RLS la organización solo lee (panel).
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create table if not exists clientes (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  -- Sin @, en minúsculas. No se verifica que la cuenta sea de quien la escribe.
  instagram        text not null,
  puntos           int not null default 0 check (puntos >= 0),
  created_at       timestamptz not null default now(),
  ultima_visita_at timestamptz not null default now()
);
create unique index if not exists clientes_org_instagram_idx on clientes(organization_id, instagram);

create table if not exists calificaciones (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  codigo          text not null,
  orden_id        uuid references ordenes(id) on delete set null,
  -- La persona de la mesa a la que se le imprimió; null = el pedido entero.
  customer_name   text,
  items           jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  expira_at       timestamptz not null default now() + interval '30 days',
  usada_at        timestamptz,
  estrellas       smallint check (estrellas between 1 and 5),
  sugerencia      text,
  cliente_id      uuid references clientes(id) on delete set null,
  puntos          int not null default 0 check (puntos >= 0)
);
create unique index if not exists calificaciones_codigo_idx on calificaciones(codigo);
create index if not exists calificaciones_org_usada_idx on calificaciones(organization_id, usada_at desc) where usada_at is not null;
create index if not exists calificaciones_orden_idx on calificaciones(orden_id);

alter table clientes enable row level security;
drop policy if exists "clientes read org" on clientes;
create policy "clientes read org" on clientes for select
  using (organization_id = public.current_org());

alter table calificaciones enable row level security;
drop policy if exists "calificaciones read org" on calificaciones;
create policy "calificaciones read org" on calificaciones for select
  using (organization_id = public.current_org());

-- Sumar puntos sin carrera entre dos envíos del mismo @.
create or replace function public.sumar_puntos_cliente(p_org uuid, p_instagram text, p_puntos int)
returns table (id uuid, puntos int)
language sql
security definer
set search_path = public
as $$
  insert into clientes (organization_id, instagram, puntos)
    values (p_org, p_instagram, greatest(p_puntos, 0))
  on conflict (organization_id, instagram)
    do update set puntos = clientes.puntos + greatest(p_puntos, 0), ultima_visita_at = now()
  returning clientes.id, clientes.puntos;
$$;
revoke all on function public.sumar_puntos_cliente(uuid, text, int) from public, anon, authenticated;
grant execute on function public.sumar_puntos_cliente(uuid, text, int) to service_role;

notify pgrst, 'reload schema';
