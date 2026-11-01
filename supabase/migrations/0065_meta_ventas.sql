-- Meta de ventas del día (01-nov-2026): el POS la muestra en «Hoy en ventas»
-- (/pos/ventas) como «81 % · Faltan $X para $META». La pone el dueño en
-- Ajustes › Sede. Vacía = la tarjeta dice «Sin meta».

alter table organizations add column if not exists meta_diaria_cop integer
  check (meta_diaria_cop is null or (meta_diaria_cop > 0 and meta_diaria_cop <= 1000000000));

comment on column organizations.meta_diaria_cop is 'Meta de ventas de un día (COP). La semana = 7 × la del día.';
