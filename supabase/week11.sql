-- ============================================================
-- Week 11: humor styles for generated captions
-- Safe to run more than once.
-- ============================================================

-- The humor style the author picked when generating (null = classic).
alter table generations add column if not exists style text;

alter table generations drop constraint if exists generations_style_check;
alter table generations add constraint generations_style_check
  check (style is null or style in
    ('relatable', 'sarcastic', 'punny', 'wholesome', 'absurd', 'dramatic'));

create index if not exists generations_style_idx on generations (style);

-- ============================================================
-- Photos: captions can be written about a picture
-- ============================================================

alter table generations add column if not exists image_url text;

-- Public bucket (like avatars). Each user can only add, replace or remove
-- files inside their own folder (<user id>/...), up to 3 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caption-images', 'caption-images', true, 3145728,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read caption images" on storage.objects;
create policy "Public read caption images" on storage.objects
  for select using (bucket_id = 'caption-images');

drop policy if exists "Users add their own caption images" on storage.objects;
create policy "Users add their own caption images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'caption-images'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users remove their own caption images" on storage.objects;
create policy "Users remove their own caption images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'caption-images'
         and (storage.foldername(name))[1] = auth.uid()::text);
