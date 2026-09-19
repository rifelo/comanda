-- =============================================================================
-- 0030 · Órdenes — varias personas por pedido
-- =============================================================================
-- Una mesa de cuatro obligaba a registrar cuatro pedidos, solo para que la
-- etiqueta de cada vaso llevara el nombre correcto. Ahora cada línea guarda a
-- quién pertenece (instantánea de texto: es lo que se imprime) y la cabecera
-- guarda el roster ordenado de la mesa, para que una persona agregada antes
-- de pedir sobreviva a «enviar pendiente → reabrir». `customer_name` en la
-- cabecera se conserva como rótulo de mesa o grupo («Mesa 3»).
-- Idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table orden_items add column if not exists customer_name text;
alter table ordenes     add column if not exists customer_names text[] not null default '{}';

comment on column ordenes.customer_name     is 'Rótulo de mesa o grupo («Mesa 3»). Los nombres por persona van en customer_names y en orden_items.customer_name.';
comment on column ordenes.customer_names    is 'Roster ordenado de las personas de la mesa (las fichas del ticket).';
comment on column orden_items.customer_name is 'Persona a la que pertenece la línea; es lo que imprime la etiqueta del vaso. Null = sin asignar.';
