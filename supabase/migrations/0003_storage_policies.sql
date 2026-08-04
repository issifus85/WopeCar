-- WopeCar Supabase schema - Step 5 (storage access rules for all three
-- buckets). Run this in the SQL Editor after 0002_rls_policies.sql. The
-- buckets themselves (car-images, avatars, documents) were already created
-- via the Storage API - this only adds RLS policies to storage.objects.
--
-- Convention: private documents must be uploaded under a path whose first
-- folder segment is the owner's auth.uid(), e.g.
--   documents/<user_id>/drivers-license-front.jpg
-- storage.foldername(name) splits the object path into segments; checking
-- segment [1] against auth.uid() is the standard Supabase pattern for
-- per-user private files, since the underlying `owner` column on
-- storage.objects isn't reliably populated across all upload paths.

create policy documents_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy documents_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy documents_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy documents_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy documents_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'documents' and is_admin())
  with check (bucket_id = 'documents' and is_admin());

-- =========================================================================
-- car-images (public bucket - "visible to all" is the read side; these
-- add the write side, which the spec didn't cover but the bucket can't
-- function without)
-- =========================================================================
-- Convention: car-images/<car_id>/filename.jpg - the first folder segment
-- is the car's id, checked against cars owned by the authenticated vendor
-- (same is_vendor_owner() helper used for the cars/availability table
-- policies in 0002_rls_policies.sql).

create policy car_images_public_select on storage.objects for select to public
  using (bucket_id = 'car-images');

create policy car_images_vendor_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'car-images'
    and exists (
      select 1 from cars
      where cars.id::text = (storage.foldername(name))[1]
        and is_vendor_owner(cars.vendor_id)
    )
  );

create policy car_images_vendor_update on storage.objects for update to authenticated
  using (
    bucket_id = 'car-images'
    and exists (
      select 1 from cars
      where cars.id::text = (storage.foldername(name))[1]
        and is_vendor_owner(cars.vendor_id)
    )
  )
  with check (
    bucket_id = 'car-images'
    and exists (
      select 1 from cars
      where cars.id::text = (storage.foldername(name))[1]
        and is_vendor_owner(cars.vendor_id)
    )
  );

create policy car_images_vendor_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'car-images'
    and exists (
      select 1 from cars
      where cars.id::text = (storage.foldername(name))[1]
        and is_vendor_owner(cars.vendor_id)
    )
  );

create policy car_images_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'car-images' and is_admin())
  with check (bucket_id = 'car-images' and is_admin());

-- =========================================================================
-- avatars (public bucket - same reasoning as car-images above)
-- =========================================================================
-- Convention: avatars/<user_id>/filename.jpg - the first folder segment is
-- the owner's auth.uid(), same pattern as the `documents` bucket.

create policy avatars_public_select on storage.objects for select to public
  using (bucket_id = 'avatars');

create policy avatars_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and is_admin())
  with check (bucket_id = 'avatars' and is_admin());
