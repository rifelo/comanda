-- =============================================================================
-- 0057 · Barista de cada pedido
-- =============================================================================
-- La caja usa una cuenta compartida, así que created_by no dice quién preparó.
-- El barista se elige en el POS («Barista: …») y cada pedido lo guarda al
-- crearse; con eso se cuentan las bebidas que preparó cada uno y se le
-- atribuyen las calificaciones de esos vasos (calificaciones.orden_id).
-- Aditiva e idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table ordenes add column if not exists barista_id uuid references profiles(id) on delete set null;
create index if not exists ordenes_org_barista_idx on ordenes(organization_id, barista_id, created_at desc);
