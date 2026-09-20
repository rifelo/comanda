-- =============================================================================
-- 0032 · admin review of a closed turno
-- =============================================================================
-- The shift lead closes the turno on the tablet; the owner then looks at the
-- evidence in /hoy and stamps it "revisado". Three nullable columns on the
-- instance — no new table, no new RLS: the existing "shifts staff update
-- assigned" policy (0001) already lets anyone who can see the restaurant
-- update the row, and the `reviewShift` server action enforces admin.
-- =============================================================================

alter table shift_instances
  add column reviewed_by  uuid references profiles(id) on delete set null,
  add column reviewed_at  timestamptz,
  add column review_note  text;

-- "Closed but not yet reviewed" is the owner's to-do list; keep it cheap.
create index shift_instances_unreviewed_idx
  on shift_instances(restaurant_id, date)
  where status = 'closed' and reviewed_at is null;
