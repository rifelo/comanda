-- =============================================================================
-- 0042 · Organizations — which label stock is in the printer
-- =============================================================================
-- The label printer normally runs 50 × 30 mm labels. A 50 × 50 mm roll is in
-- use for a while, and it prints a different set: per cup, one label with the
-- customer's name and the drink, and one with the Instagram QR, the brand
-- icon and the phrase. The POS reads the size here so every station (the one
-- that takes the order and the one that prints) agrees on what to print.
-- `label_art_url` is the brand illustration at the foot of the name label.
-- =============================================================================
alter table organizations
  add column if not exists label_size text not null default '50x30'
    check (label_size in ('50x30', '50x50'));
alter table organizations
  add column if not exists label_art_url text;

update organizations
  set label_art_url = '/labels/payo-hand.png'
  where id = 'b069847f-7fb9-4ddb-a85d-9707da9a03d7' and label_art_url is null;

notify pgrst, 'reload schema';
