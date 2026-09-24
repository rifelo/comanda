-- =============================================================================
-- 0037 · Cierre de caja (arqueo) al cerrar el turno
-- =============================================================================
-- El equipo cuenta el efectivo de la caja en el tablet (a ciegas: sin ver lo
-- que el POS espera), el cierre queda guardado con la ventana de ventas que se
-- usó para calcular el esperado, y el dueño lo aprueba o rechaza desde /hoy.
-- Mismo patrón que inventario_conteos (0032). Una sola tabla: las
-- denominaciones van en jsonb porque la lista es fija (11 valores en COP) y
-- nunca se consulta por línea.
--   esperado   = base_inicial + efectivo del POS en la ventana
--   diferencia = contado - esperado        (negativo = falta plata)
--   entrega    = contado - base_dejada     (lo que sale de la caja)
-- Idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create table if not exists caja_cierres (
  id                 uuid primary key default uuid_generate_v4(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  restaurant_id      uuid references restaurants(id) on delete set null,
  shift_instance_id  uuid references shift_instances(id) on delete set null,
  status             text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado')),
  counted_by         uuid references profiles(id) on delete set null,
  submitted_at       timestamptz not null default now(),
  reviewed_by        uuid references profiles(id) on delete set null,
  reviewed_at        timestamptz,
  note               text,
  review_note        text,
  -- ventana de ventas usada para el esperado (snapshot al enviar)
  ventana_desde      timestamptz not null,
  ventana_hasta      timestamptz not null,
  -- lo que había al abrir (la base que dejó el turno anterior; editable)
  base_inicial_cop   int not null default 0 check (base_inicial_cop >= 0),
  -- ventas del POS en la ventana (snapshot)
  efectivo_cop       int not null default 0 check (efectivo_cop >= 0),
  tarjeta_cop        int not null default 0 check (tarjeta_cop >= 0),
  transferencia_cop  int not null default 0 check (transferencia_cop >= 0),
  pagos_count        int not null default 0 check (pagos_count >= 0),
  esperado_cop       int not null check (esperado_cop >= 0),
  contado_cop        int not null check (contado_cop >= 0),
  diferencia_cop     int not null,
  -- base que se deja para mañana
  base_dejada_cop    int not null default 0 check (base_dejada_cop >= 0),
  denominaciones     jsonb not null default '[]'::jsonb check (jsonb_typeof(denominaciones) = 'array')
);
create index if not exists caja_cierres_org_idx on caja_cierres(organization_id, submitted_at desc);
create index if not exists caja_cierres_instance_idx on caja_cierres(shift_instance_id);
-- Un cierre vivo por turno; uno rechazado se puede volver a contar.
create unique index if not exists caja_cierres_instance_live_key on caja_cierres(shift_instance_id)
  where shift_instance_id is not null and status <> 'rechazado';

alter table caja_cierres enable row level security;

drop policy if exists "caja read org" on caja_cierres;
create policy "caja read org" on caja_cierres for select
  using (organization_id = public.current_org());
drop policy if exists "caja insert org" on caja_cierres;
create policy "caja insert org" on caja_cierres for insert
  with check (organization_id = public.current_org());
drop policy if exists "caja admin update" on caja_cierres;
create policy "caja admin update" on caja_cierres for update
  using (public.current_role() = 'admin' and organization_id = public.current_org())
  with check (public.current_role() = 'admin' and organization_id = public.current_org());

comment on table  caja_cierres                is 'Arqueo de caja al cierre del turno; el dueño lo aprueba desde /hoy.';
comment on column caja_cierres.esperado_cop   is 'base_inicial + efectivo del POS en la ventana (snapshot al enviar).';
comment on column caja_cierres.denominaciones is 'Array de {valor, cantidad} en COP.';
