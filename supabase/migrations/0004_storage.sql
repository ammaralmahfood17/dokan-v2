-- ============================================================================
-- DOKAN — Storage buckets for logos and product images
-- ============================================================================
-- Public read (menu images must load for anonymous customers), writes
-- restricted to owner/manager of the matching business via storage policies.
-- Convention: object path = "<business_id>/<file>.jpg" — the business_id
-- segment is what we check against staff_members in the policy below.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('business-assets', 'business-assets', true)
on conflict (id) do nothing;

create policy "business_assets_public_read"
on storage.objects for select
using (bucket_id = 'business-assets');

create policy "business_assets_staff_upload"
on storage.objects for insert
with check (
  bucket_id = 'business-assets'
  and (storage.foldername(name))[1]::uuid in (select staff_business_ids())
);

create policy "business_assets_staff_update"
on storage.objects for update
using (
  bucket_id = 'business-assets'
  and (storage.foldername(name))[1]::uuid in (select staff_business_ids())
);

create policy "business_assets_staff_delete"
on storage.objects for delete
using (
  bucket_id = 'business-assets'
  and (storage.foldername(name))[1]::uuid in (select staff_business_ids())
);
