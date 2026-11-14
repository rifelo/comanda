-- Premios Mi Pa'Yo (owner, 2026-11-14 — docs/marketing/premios-mi-payo.md).
--
-- clientes.puntos is still the balance. Purchases keep adding through
-- sumar_puntos_cliente (0049); everything else that moves the balance —
-- the welcome bonus, a redeemed reward, a manual correction — is a row here,
-- so the balance can always be explained. A redemption at the register also
-- leaves an approved orden_descuentos row (0085) that prices the drink at $0.

create table if not exists puntos_movimientos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  cliente_id      uuid not null references clientes(id) on delete cascade,
  tipo            text not null check (tipo in ('bienvenida', 'canje', 'ajuste')),
  puntos          int not null check (puntos <> 0),
  premio          text,
  orden_id        uuid references ordenes(id) on delete set null,
  producto_nombre text,
  hecho_por       uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists puntos_movimientos_org_idx on puntos_movimientos(organization_id, created_at desc);
create index if not exists puntos_movimientos_cliente_idx on puntos_movimientos(cliente_id, created_at desc);
-- One welcome bonus per customer, ever.
create unique index if not exists puntos_movimientos_bienvenida_uq on puntos_movimientos(cliente_id) where tipo = 'bienvenida';

alter table puntos_movimientos enable row level security;
drop policy if exists "puntos_movimientos read org" on puntos_movimientos;
create policy "puntos_movimientos read org" on puntos_movimientos for select
  using (organization_id = public.current_org());

-- Move a customer's balance and log why, atomically. Returns the new balance;
-- null when the move was already done (a second welcome bonus). Raises P0001
-- «saldo insuficiente» when it would leave the balance below zero.
create or replace function public.mover_puntos(
  p_org uuid, p_cliente uuid, p_puntos int, p_tipo text,
  p_premio text default null, p_orden uuid default null, p_producto text default null, p_por uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  begin
    insert into puntos_movimientos (organization_id, cliente_id, tipo, puntos, premio, orden_id, producto_nombre, hecho_por)
      values (p_org, p_cliente, p_tipo, p_puntos, p_premio, p_orden, p_producto, p_por);
  exception when unique_violation then
    return null;
  end;
  update clientes set puntos = puntos + p_puntos
    where id = p_cliente and organization_id = p_org and puntos + p_puntos >= 0
    returning puntos into v;
  if v is null then
    raise exception 'saldo insuficiente' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function public.mover_puntos(uuid, uuid, int, text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.mover_puntos(uuid, uuid, int, text, text, uuid, text, uuid) to service_role;

-- Everyone who already has an @ gets the welcome bonus too (launch).
select public.mover_puntos(c.organization_id, c.id, 10, 'bienvenida')
  from clientes c
  where not exists (select 1 from puntos_movimientos m where m.cliente_id = c.id and m.tipo = 'bienvenida');

comment on table puntos_movimientos is 'Movimientos de puntos que no son compras: bono de bienvenida, canjes de premios, ajustes.';

notify pgrst, 'reload schema';
