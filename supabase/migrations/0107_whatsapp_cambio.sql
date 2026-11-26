-- A change the customer asked for over WhatsApp after the bar accepted the
-- order (add a torta, another drink, a different cup name): the agent can't
-- rewrite an accepted order, so it leaves it here for the POS card to apply or
-- discard. null = nothing pending.
--   { texto: "+ 1 Torta de limón y arándanos ($7.000)", at, subtotal, items: PricedItem[],
--     campos: { order_type, se_lo_llevamos, delivery_address, telefono_recibe, customer_name, customer_names } }
alter table ordenes add column if not exists wa_cambio jsonb;
