-- Gap surfaced while wiring vendor-side inspection write access: the
-- `documents` bucket's only SELECT policy (0003_storage_policies.sql) is
-- "the uploader can read their own files" - fine for driver's-license-style
-- private docs, but wrong for an inspection: the file_path stored on
-- vehicle_inspection_photos/vehicle_inspections is uploaded under whichever
-- party's uid happened to submit it (documents/<uploader_id>/inspections/
-- <inspection_id>/...), yet BOTH the renter and vendor of that booking need
-- to view it later (app/inspection/report.js's createSignedUrl call uses the
-- stored path as-is, for whichever user is viewing). Table-level RLS on
-- vehicle_inspections already grants both parties read; storage now matches.
create policy documents_inspection_participant_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] = 'inspections'
    and exists (
      select 1 from vehicle_inspections vi
      join bookings b on b.id = vi.booking_id
      where vi.id::text = (storage.foldername(name))[3]
        and (b.renter_id = auth.uid() or is_vendor_owner(b.vendor_id))
    )
  );
