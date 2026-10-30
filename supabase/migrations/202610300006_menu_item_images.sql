-- Food menu image support.
-- Run this migration in Supabase SQL Editor after migration 005.

alter table public.menu_items
  add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "Public can view menu images" on storage.objects;
create policy "Public can view menu images" on storage.objects
for select to anon, authenticated
using (bucket_id = 'menu-images');

drop policy if exists "Staff can upload menu images" on storage.objects;
create policy "Staff can upload menu images" on storage.objects
for insert to authenticated
with check (bucket_id = 'menu-images' and public.is_counter_staff());

drop policy if exists "Staff can update menu images" on storage.objects;
create policy "Staff can update menu images" on storage.objects
for update to authenticated
using (bucket_id = 'menu-images' and public.is_counter_staff())
with check (bucket_id = 'menu-images' and public.is_counter_staff());

drop policy if exists "Staff can delete menu images" on storage.objects;
create policy "Staff can delete menu images" on storage.objects
for delete to authenticated
using (bucket_id = 'menu-images' and public.is_counter_staff());

grant select, insert, update on public.menu_items to authenticated;
