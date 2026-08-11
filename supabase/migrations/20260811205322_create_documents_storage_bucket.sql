-- Bucket privado para los archivos originales (RF-004, RNF-003). Ruta de
-- objeto: {user_id}/{document_id}/original.{extension} — el primer segmento
-- de la ruta es el owner, igual que el aislamiento de la tabla documents.
-- Limite de tamano (10 MB) validado en la aplicacion antes de subir
-- (src/modules/documents/validation.ts); file_size_limit aqui es una
-- segunda barrera a nivel de Storage, no la unica.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "documents_bucket_select_own_or_admin" on storage.objects
  for select
  using (
    bucket_id = 'documents'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy "documents_bucket_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_bucket_update_own_or_admin" on storage.objects
  for update
  using (
    bucket_id = 'documents'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  )
  with check (
    bucket_id = 'documents'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy "documents_bucket_delete_own_or_admin" on storage.objects
  for delete
  using (
    bucket_id = 'documents'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );
