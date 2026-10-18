-- =============================================================================
-- 0052 · Calificaciones: un QR por bebida
-- =============================================================================
-- Cada bebida imprime sus 4 etiquetas (nombre, QR, bebida, frase), así que una
-- persona con tres bebidas recibe tres QR. Para no pagar los puntos tres veces,
-- cada QR vale lo de su propia bebida:
--   · linea_position  la línea del pedido (orden_items.position) de esa bebida;
--                     null = un QR viejo, que vale todo lo de la persona
--   · con_resto       el primer QR de la persona también suma lo que no lleva
--                     etiqueta (comida, botellas)
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table calificaciones add column if not exists linea_position int;
alter table calificaciones add column if not exists con_resto boolean not null default false;

notify pgrst, 'reload schema';
