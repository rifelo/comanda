-- Logo en el recibo de papel (01-nov-2026): la caja lo imprime arriba del
-- recibo, en lugar del nombre en texto. Una URL (ruta del sitio o https) de un
-- logo a UNA tinta negra: el papel térmico no tiene grises.

alter table organizations add column if not exists recibo_logo_url text
  check (char_length(recibo_logo_url) <= 500);

comment on column organizations.recibo_logo_url is 'Logo a una tinta para el recibo de papel (URL o ruta del sitio).';

update organizations set recibo_logo_url = '/brand/payo-recibo.svg'
where id = 'b069847f-7fb9-4ddb-a85d-9707da9a03d7' and recibo_logo_url is null;
