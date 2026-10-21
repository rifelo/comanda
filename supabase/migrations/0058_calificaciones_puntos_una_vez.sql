-- =============================================================================
-- 0058 · Los puntos de una bebida se pagan una sola vez
-- =============================================================================
-- Un vaso puede terminar con más de un QR (una reimpresión, la etiqueta
-- duplicada de un reintento). Cada código se usa una vez (usada_at), pero sin
-- esto cada copia volvería a pagar los puntos de la misma bebida. Solo una
-- calificación por bebida puede tener puntos; las demás se guardan con 0.
--   · QR por bebida (0052): una por (orden_id, linea_position)
--   · QR viejos (linea_position null, valen todo lo de la persona): una por
--     (orden_id, persona) — la persona como la compara mismoCliente (trim)
-- El servidor reclama los puntos en la fila antes de sumarlos al cliente, así
-- que dos envíos simultáneos no pueden pasar los dos.
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
create unique index if not exists calificaciones_puntos_bebida_idx
  on calificaciones(orden_id, linea_position)
  where puntos > 0 and linea_position is not null;
create unique index if not exists calificaciones_puntos_persona_idx
  on calificaciones(orden_id, (coalesce(btrim(customer_name), '')))
  where puntos > 0 and linea_position is null;
