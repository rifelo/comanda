-- =============================================================================
-- 0006 · Productos image column + storage bucket
-- =============================================================================
-- Adds the public-read `producto-photos` Storage bucket and the
-- `productos.image_url` column the catálogo's NuevoProductoDrawer writes
-- to. Path convention: `<organization_id>/<producto_id>.<ext>`.
--
-- Bucket is public-read because a product catalogue is essentially
-- customer-facing. If product photos ever become sensitive, flip
-- `public` to false and switch the client to signed URLs — no schema
-- changes needed.
-- =============================================================================

alter table productos add column image_url text;

insert into storage.buckets (id, name, public)
values ('producto-photos', 'producto-photos', true)
on conflict (id) do nothing;

-- ---------- storage policies ----------
-- Public read (anyone with the URL — matches `public = true` above; the
-- explicit policy is required because RLS is on by default for
-- storage.objects).
create policy "producto photos read public"
  on storage.objects for select
  using (bucket_id = 'producto-photos');

-- Admin write: first path segment must equal the admin's org id, so a
-- compromised admin client can't write into another org's prefix even
-- if the upload signs with their JWT.
create policy "producto photos admin insert"
  on storage.objects for insert
  with check (
    bucket_id = 'producto-photos'
    and public.current_role() = 'admin'
    and (storage.foldername(name))[1]::uuid = public.current_org()
  );

create policy "producto photos admin update"
  on storage.objects for update
  using (
    bucket_id = 'producto-photos'
    and public.current_role() = 'admin'
    and (storage.foldername(name))[1]::uuid = public.current_org()
  )
  with check (
    bucket_id = 'producto-photos'
    and public.current_role() = 'admin'
    and (storage.foldername(name))[1]::uuid = public.current_org()
  );

create policy "producto photos admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'producto-photos'
    and public.current_role() = 'admin'
    and (storage.foldername(name))[1]::uuid = public.current_org()
  );
