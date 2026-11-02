-- Tirillas del canvas (01-nov-2026): la precuenta y la comanda llevan el ícono
-- de la marca y, debajo, el nombre en Nority («Café Pa'Yo»). organizations.name
-- es el nombre interno («Cafe PA'YO's org»), así que el recibo tiene el suyo.

alter table organizations add column if not exists recibo_nombre text
  check (char_length(recibo_nombre) <= 60);

comment on column organizations.recibo_nombre is 'Nombre de la marca en el recibo y la comanda (vacío = nombre de la organización).';

-- PA'YO: el ícono a una tinta del canvas (antes el logo completo) y la línea
-- de dirección y redes del diseño, solo si el dueño no ha escrito la suya.
update organizations set
  recibo_nombre = coalesce(recibo_nombre, 'Café Pa''Yo'),
  recibo_logo_url = '/labels/payo-icono.svg',
  recibo_encabezado = coalesce(recibo_encabezado, 'Yopal, Casanare · @cafepayo · cafepayo.com')
where id = 'b069847f-7fb9-4ddb-a85d-9707da9a03d7';
