-- Dónde está la impresora de recibos (02-nov-2026).
--
-- Cada POS con «Recibos y comandas: Aquí» avisa cada 30 s que sigue abierto
-- (visto_at) y si imprime directo o abre el cuadro de impresión (silencioso,
-- medido en su última impresión). Los demás equipos leen la lista para saber
-- a cuál le llegan sus tickets, si está activo, y avisar cuando ninguno lo
-- está. Una fila sin latido en 90 s cuenta como caja cerrada.

create table if not exists pos_ticket_estaciones (
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Id aleatorio que cada navegador guarda en localStorage (pos:device-id).
  device_id text not null check (char_length(device_id) between 8 and 64),
  -- Nombre del dispositivo vinculado («Caja 01») y el equipo («Windows · Edge»).
  nombre text not null check (char_length(nombre) <= 80),
  equipo text check (char_length(equipo) <= 80),
  -- null = aún no ha impreso; false = su última impresión abrió el cuadro.
  silencioso boolean,
  papel text check (papel in ('80', '58')),
  visto_at timestamptz not null default now(),
  primary key (organization_id, device_id)
);

alter table pos_ticket_estaciones enable row level security;
drop policy if exists "pos_ticket_estaciones org" on pos_ticket_estaciones;
create policy "pos_ticket_estaciones org" on pos_ticket_estaciones for all
  using (organization_id = public.current_org())
  with check (organization_id = public.current_org());

comment on table pos_ticket_estaciones is 'POS con la impresora de recibos: latido cada 30 s y si imprime sin cuadro de diálogo.';

notify pgrst, 'reload schema';
