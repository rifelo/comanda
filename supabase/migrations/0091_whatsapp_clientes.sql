-- Ficha por cliente de WhatsApp (por teléfono): lo que el agente aprende para
-- atenderlo como una persona que ya lo conoce — cómo saludarlo, su pedido de
-- siempre, dónde lo recibe, cómo paga y notas. El agente la lee en cada
-- respuesta y la actualiza con la herramienta `recordar_cliente`.
create table if not exists whatsapp_clientes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  wa_id           text not null,          -- teléfono E.164 sin «+»
  trato           text,                   -- cómo saludarlo: «Doc. Bibiana»
  habitual        text,                   -- su pedido de siempre, en palabras
  entrega         text,                   -- «portería», «pasa a recoger»…
  pago            text,                   -- «Nequi», «efectivo al recibir»…
  notas           text,                   -- gustos, alergias, horarios
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, wa_id)
);

alter table whatsapp_clientes enable row level security;
drop policy if exists "whatsapp_clientes read admin" on whatsapp_clientes;
create policy "whatsapp_clientes read admin" on whatsapp_clientes for select
  using (organization_id = public.current_org() and public.current_role() = 'admin');

-- Datos de pago que el agente comparte cuando el cliente paga por transferencia.
alter table whatsapp_numeros add column if not exists pagos text;

notify pgrst, 'reload schema';
