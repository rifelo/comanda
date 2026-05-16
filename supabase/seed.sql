-- =============================================================================
-- Demo seed: Daniel's Burger as the example restaurant template.
-- Run after migration 0001 against a clean database to create a demo org/restaurant
-- with the cajero day + night plantillas pre-loaded from the paper sheet
-- (FO-DB-05 v01, 2024-04-30). Both are now just plain plantillas — the
-- day/night enum was dropped in 0004.
--
-- This seed bypasses RLS because supabase db reset runs as the superuser.
-- =============================================================================

-- Demo org + restaurant
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Daniel''s Burger Co.');

insert into restaurants (id, organization_id, name, timezone) values
  ('00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'Daniel''s Burger - Sede Demo',
   'America/Bogota');

-- ---------- Cajero · Día template ----------
insert into checklist_templates (id, restaurant_id, name) values
  ('00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-000000000002',
   'Cajero - Turno Día');

insert into template_tasks (template_id, order_index, title, instructions, due_time, requires_photo) values
  ('00000000-0000-0000-0000-0000000000d1', 1,  'Abrir arqueo a las 10:30', null, '10:30', false),
  ('00000000-0000-0000-0000-0000000000d1', 2,  'Organizar sonido (playlists predeterminadas en la tablet)',
     'No se permite apagar la música en horarios de atención al público; otro tipo de música debe estar pendiente para encenderla otra vez.',
     null, false),
  ('00000000-0000-0000-0000-0000000000d1', 3,  'Limpiar las mesas y ubicar los servilleteros en cada una',
     'Barrer, sacar las sillas y mesas de la parte de afuera.', null, true),
  ('00000000-0000-0000-0000-0000000000d1', 4,  'Trapear con buen desinfectante, desengrasante y jabón el salón de clientes',
     null, null, true),
  ('00000000-0000-0000-0000-0000000000d1', 5,  'Organizar el escritorio, cajones y demás elementos que generen aspecto de desorden',
     null, null, false),
  ('00000000-0000-0000-0000-0000000000d1', 6,  'Ingresar los vasos de calavera y copas para dama en la nevera para enfriar',
     null, null, false),
  ('00000000-0000-0000-0000-0000000000d1', 7,  'Limpiar y surtir nevera Coca-Cola',
     'Incluye los maderos de la barra.', null, true),
  ('00000000-0000-0000-0000-0000000000d1', 8,  'Limpiar paredes del área de pago', null, null, false),
  ('00000000-0000-0000-0000-0000000000d1', 9,  'Organizar parte de atrás de la nevera Coca-Cola', null, null, true),
  ('00000000-0000-0000-0000-0000000000d1', 10, 'Cargar factura de mercado entregado por procesos a Daniel''s y demás facturas',
     null, null, false),
  ('00000000-0000-0000-0000-0000000000d1', 11, 'A la 1:30 organizar recibos para entrega de caja', null, '13:30', false),
  ('00000000-0000-0000-0000-0000000000d1', 12, 'Cerrar arqueo 02:30 pm según procedimiento entrega de caja', null, '14:30', false);

-- ---------- Cajero · Noche template ----------
insert into checklist_templates (id, restaurant_id, name) values
  ('00000000-0000-0000-0000-0000000000d2',
   '00000000-0000-0000-0000-000000000002',
   'Cajero - Turno Noche');

insert into template_tasks (template_id, order_index, title, instructions, due_time, requires_photo) values
  ('00000000-0000-0000-0000-0000000000d2', 1, 'Recibir caja según procedimiento de entrega y apertura de caja 6:00 pm',
     null, '18:00', false),
  ('00000000-0000-0000-0000-0000000000d2', 2, 'Abrir arqueo turno noche', null, '18:00', false),
  ('00000000-0000-0000-0000-0000000000d2', 3, 'Organizar documentos para finalizar turno noche', null, null, false),
  ('00000000-0000-0000-0000-0000000000d2', 4, 'A las 10:00 pm organizar los recibos (gruesos), quedarse con el sencillo',
     null, '22:00', false),
  ('00000000-0000-0000-0000-0000000000d2', 5, 'Entregar dinero de caja a procesos (gruesos), quedarse con el sencillo',
     null, null, false),
  ('00000000-0000-0000-0000-0000000000d2', 6, 'Cerrar arqueo, entregar novedades del día a la administradora', null, null, false),
  ('00000000-0000-0000-0000-0000000000d2', 7, 'Dejar el sitio de trabajo ordenado y limpio para el día siguiente',
     null, null, true),
  ('00000000-0000-0000-0000-0000000000d2', 8, 'Apagar la luz del baño', null, null, false);
