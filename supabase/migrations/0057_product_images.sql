-- 0060: product images — dedicated public bucket with modern (project_id)
-- policies. The old business-assets bucket uses legacy business_id policies
-- (staff_business_ids) that no longer match the project_id model.
-- Path convention: <project_id>/<file> — the first folder segment is the
-- tenant key checked against is_project_member().

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public read: menu images must load for anonymous customers.
create policy "product_images_public_read"
on storage.objects for select
using (bucket_id = 'product-images');

-- Write restricted to project members (owner/manager/staff).
create policy "product_images_member_upload"
on storage.objects for insert
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1]::uuid = (select project_id from public.projects p where p.id = (storage.foldername(name))[1]::uuid)
  and public.is_project_member((storage.foldername(name))[1]::uuid)
);

create policy "product_images_member_update"
on storage.objects for update
using (
  bucket_id = 'product-images'
  and public.is_project_member((storage.foldername(name))[1]::uuid)
);

create policy "product_images_member_delete"
on storage.objects for delete
using (
  bucket_id = 'product-images'
  and public.is_project_member((storage.foldername(name))[1]::uuid)
);
