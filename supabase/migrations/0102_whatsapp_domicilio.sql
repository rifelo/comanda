-- WhatsApp deliveries: the courier's fee varies, so the barista types it when
-- accepting the order. The customer may add it to the transfer or pay it to
-- the courier on delivery; the admin records which when approving the payment.
-- It is not a sale of the café (not in total_cop): only what to tell the
-- customer and who pays the courier.
alter table ordenes
  add column if not exists domicilio_cop integer check (domicilio_cop is null or domicilio_cop between 0 and 200000),
  add column if not exists domicilio_transferido boolean;   -- null = aún no se sabe; true = vino en la transferencia; false = se lo paga al domiciliario
notify pgrst, 'reload schema';
