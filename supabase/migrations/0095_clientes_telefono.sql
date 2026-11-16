-- =============================================================================
-- 0095 · Teléfono de WhatsApp del cliente de Mi Pa'Yo
-- =============================================================================
-- El agente de WhatsApp quiere contestar «¿cuántos puntos llevo?», «¿qué
-- premio me alcanza?» o «¿qué pedí?»; para eso necesita saber qué @ de
-- Instagram (clientes) corresponde al número que escribe.
--   telefono               solo dígitos, E.164 sin «+» (573001234567), igual
--                          que ordenes.customer_phone y whatsapp_clientes.wa_id.
--                          Un número pertenece a un solo @ por organización.
--   telefono_vinculado_at  cuándo quedó vinculado.
--   telefono_origen        'qr'     el cliente escaneó el QR del vaso de un
--                                   pedido hecho por WhatsApp y escribió su @.
--                          'enlace' abrió el enlace firmado que le mandó el
--                                   agente y confirmó su @.
-- Nunca se pisa un teléfono distinto ni se le quita el número a otro @: eso
-- lo decide la aplicación; el índice único es la última defensa.
-- Aditiva e idempotente.
-- =============================================================================
alter table clientes add column if not exists telefono text;
alter table clientes add column if not exists telefono_vinculado_at timestamptz;
alter table clientes add column if not exists telefono_origen text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_telefono_origen_check') then
    alter table clientes add constraint clientes_telefono_origen_check check (telefono_origen in ('qr', 'enlace'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clientes_telefono_digitos_check') then
    alter table clientes add constraint clientes_telefono_digitos_check check (telefono ~ '^[0-9]{8,15}$');
  end if;
end $$;

create unique index if not exists clientes_org_telefono_idx on clientes(organization_id, telefono) where telefono is not null;

-- RLS ya está activa en clientes desde 0049 (la organización solo lee).
alter table clientes enable row level security;

notify pgrst, 'reload schema';
