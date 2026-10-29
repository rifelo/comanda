-- =============================================================================
-- 0062 · Agente de ventas por WhatsApp (Cloud API)
-- =============================================================================
-- El número del negocio se conecta a la Cloud API de Meta. Cada número apunta a
-- una organización y una sede (`whatsapp_numeros`), con lo que el agente debe
-- saber del local: dirección, horario y cómo funcionan los domicilios.
-- Cada cliente es una conversación; sus mensajes quedan guardados, también los
-- que el equipo escribe desde la app del celular (coexistencia): cuando alguien
-- del equipo contesta, el agente se calla un rato (`agente_pausado_hasta`).
-- Un pedido del agente entra al POS como orden pendiente con canal 'whatsapp',
-- el teléfono del cliente y, si es domicilio, la dirección.
-- Solo el servidor (service role) escribe; el dueño lee las conversaciones.
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create table if not exists whatsapp_numeros (
  phone_number_id  text primary key,                -- id de Meta del número
  organization_id  uuid not null references organizations(id) on delete cascade,
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  display_phone    text,
  direccion        text,
  horario          text,
  domicilios       text,                            -- cobertura y costo, en palabras
  agente_activo    boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists whatsapp_numeros_org_idx on whatsapp_numeros(organization_id);

create table if not exists whatsapp_conversaciones (
  id                   uuid primary key default uuid_generate_v4(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  phone_number_id      text not null references whatsapp_numeros(phone_number_id) on delete cascade,
  wa_id                text not null,               -- teléfono del cliente (E.164 sin «+»)
  nombre               text,
  agente_pausado_hasta timestamptz,
  ultimo_entrante_at   timestamptz,
  created_at           timestamptz not null default now(),
  unique (phone_number_id, wa_id)
);
create index if not exists whatsapp_conversaciones_org_idx
  on whatsapp_conversaciones(organization_id, ultimo_entrante_at desc);

create table if not exists whatsapp_mensajes (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  conversacion_id  uuid not null references whatsapp_conversaciones(id) on delete cascade,
  wa_message_id    text unique,                     -- Meta reintenta webhooks: evita duplicados
  autor            text not null check (autor in ('cliente', 'agente', 'equipo')),
  texto            text not null,
  orden_id         uuid references ordenes(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists whatsapp_mensajes_conv_idx
  on whatsapp_mensajes(conversacion_id, created_at);

alter table ordenes
  add column if not exists canal text not null default 'pos'
    check (canal in ('pos', 'whatsapp')),
  add column if not exists customer_phone text,
  add column if not exists delivery_address text;

alter table whatsapp_numeros        enable row level security;
alter table whatsapp_conversaciones enable row level security;
alter table whatsapp_mensajes       enable row level security;
drop policy if exists "whatsapp_numeros read admin" on whatsapp_numeros;
create policy "whatsapp_numeros read admin" on whatsapp_numeros for select
  using (organization_id = public.current_org() and public.current_role() = 'admin');
drop policy if exists "whatsapp_conversaciones read admin" on whatsapp_conversaciones;
create policy "whatsapp_conversaciones read admin" on whatsapp_conversaciones for select
  using (organization_id = public.current_org() and public.current_role() = 'admin');
drop policy if exists "whatsapp_mensajes read admin" on whatsapp_mensajes;
create policy "whatsapp_mensajes read admin" on whatsapp_mensajes for select
  using (organization_id = public.current_org() and public.current_role() = 'admin');

notify pgrst, 'reload schema';
