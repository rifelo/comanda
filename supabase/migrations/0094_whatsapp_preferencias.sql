-- Preferencias del cliente en su ficha: lo que pide siempre de cierta forma
-- (leche deslactosada, tamaño 16 oz, poca azúcar…). El agente las usa por
-- defecto al armar el pedido y las confirma en el resumen. Las elecciones que
-- se repiten en sus pedidos se calculan aparte, de los pedidos mismos.
alter table whatsapp_clientes add column if not exists preferencias text;

notify pgrst, 'reload schema';
