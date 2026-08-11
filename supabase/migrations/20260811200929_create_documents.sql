-- documents: metadata del documento capturado/subido por el usuario (RF-004).
-- Correccion de Fase 1 respecto a docs/architecture/data-model.md: status con
-- CHECK constraint explicito sobre los 5 valores permitidos.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  document_type text not null,
  original_file_path text not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'processed', 'validated', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.documents.original_file_path is 'Ruta en Storage: {user_id}/{document_id}/original.{extension}';

create index documents_owner_id_created_at_idx on public.documents (owner_id, created_at desc);
create index documents_status_idx on public.documents (status);
create index documents_document_type_idx on public.documents (document_type);

create trigger documents_set_updated_at
  before update on public.documents
  for each row
  execute function public.set_updated_at();

alter table public.documents enable row level security;

create policy "documents_select_own_or_admin" on public.documents
  for select
  using (owner_id = auth.uid() or public.is_admin());

create policy "documents_insert_own" on public.documents
  for insert
  with check (owner_id = auth.uid());

create policy "documents_update_own_or_admin" on public.documents
  for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

create policy "documents_delete_own_or_admin" on public.documents
  for delete
  using (owner_id = auth.uid() or public.is_admin());
