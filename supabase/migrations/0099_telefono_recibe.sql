-- Domicilios por WhatsApp: el teléfono de quien recibe (puede ser otra
-- persona distinta a quien escribe). Se lo pasamos al domiciliario.
alter table ordenes add column if not exists telefono_recibe text;

-- Entregas cercanas gratis (la droguería, la portería del hospital…): uno
-- por línea, en Ajustes › Sede. El equipo lleva el pedido, sin domiciliario.
alter table organizations add column if not exists puntos_cercanos text;

notify pgrst, 'reload schema';
