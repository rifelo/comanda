-- =============================================================================
-- 0039 · Plan de base en el cierre de caja
-- =============================================================================
-- Al enviar el cierre el sistema calcula, con lo contado por denominación,
-- qué billetes y monedas quedan como base (las piezas más pequeñas que
-- suman la base exacta: lib/caja/base.ts) y lo guarda en la fila. Quien
-- cierra confirma que armó esa base; quien abre el siguiente turno valida
-- que la encontró igual (o anota lo que encontró).
-- Idempotente: pensada para aplicarse con un sondeo inexistente.
-- =============================================================================
alter table caja_cierres
  add column if not exists base_denominaciones jsonb not null default '[]'::jsonb,
  add column if not exists base_exacta        boolean not null default true,
  add column if not exists base_confirmada_at timestamptz,
  add column if not exists base_confirmada_by uuid references profiles(id) on delete set null,
  add column if not exists base_validada_at   timestamptz,
  add column if not exists base_validada_by   uuid references profiles(id) on delete set null,
  add column if not exists base_validada_ok   boolean,
  add column if not exists base_validada_nota text,
  add column if not exists base_encontrada_cop int check (base_encontrada_cop is null or base_encontrada_cop >= 0);

comment on column caja_cierres.base_denominaciones is 'Array de {valor, cantidad}: las piezas que quedan como base (plan calculado al enviar).';
comment on column caja_cierres.base_exacta        is 'false cuando lo contado no permitía armar la base exacta (la base quedó corta).';
comment on column caja_cierres.base_confirmada_at is 'Quien cerró confirmó que dejó exactamente esas piezas.';
comment on column caja_cierres.base_validada_ok   is 'Quien abrió el siguiente turno encontró la base tal cual (true) o distinta (false).';
