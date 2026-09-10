-- =============================================================================
-- 0021 · Órdenes — tender (payment) + customer name from the Square-style POS
-- =============================================================================
alter table ordenes
  add column payment_method text
    check (payment_method in ('efectivo', 'tarjeta', 'transferencia')),
  add column tendered_cop   int check (tendered_cop >= 0),   -- cash received (efectivo)
  add column change_cop     int not null default 0 check (change_cop >= 0),
  add column customer_name  text;
