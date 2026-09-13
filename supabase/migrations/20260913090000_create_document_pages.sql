-- document_pages: fotos adicionales de un documento (RF-001, expandido para
-- contract_es -- ver docs/decisions/0003-perfil-ocr-contratos.md, pendiente
-- "Contratos multi-pagina"). `documents.original_file_path` sigue siendo la
-- portada/pagina 1 (sin migracion de datos, facturas no cambian); esta
-- tabla solo existe para la pagina 2 en adelante, cuando las hay.
-- Mismo patron de RLS que ocr_results (resuelto via el documento dueno).

create table public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  page_number integer not null check (page_number >= 2),
  file_path text not null,
  created_at timestamptz not null default now(),
  unique (document_id, page_number)
);

comment on column public.document_pages.file_path is 'Ruta en Storage: {user_id}/{document_id}/page-{page_number}.{extension}';

create index document_pages_document_id_idx on public.document_pages (document_id);

alter table public.document_pages enable row level security;

create policy "document_pages_select_via_document" on public.document_pages
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = document_pages.document_id and d.owner_id = auth.uid()
    )
  );

create policy "document_pages_insert_via_document" on public.document_pages
  for insert
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_pages.document_id and d.owner_id = auth.uid()
    )
  );

create policy "document_pages_delete_via_document" on public.document_pages
  for delete
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = document_pages.document_id and d.owner_id = auth.uid()
    )
  );

-- Sin UPDATE: una pagina no se reemplaza in-place -- se borra (cascade con
-- el documento) y, si hiciera falta, se vuelve a subir como fila nueva.
