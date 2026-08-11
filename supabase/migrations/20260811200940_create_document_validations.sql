-- document_validations: validacion humana de RF-007. Conserva el resultado
-- OCR original y el validado; nunca sobrescribe ocr_results. Inmutable una
-- vez creada (una correccion posterior es una fila nueva, no un UPDATE).

create table public.document_validations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  original_extracted_data jsonb not null,
  validated_data jsonb not null,
  manually_edited boolean not null default false,
  validated_by uuid not null references public.profiles (id),
  validated_at timestamptz not null default now()
);

create index document_validations_document_id_idx on public.document_validations (document_id);

alter table public.document_validations enable row level security;

create policy "document_validations_select_via_document" on public.document_validations
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = document_validations.document_id and d.owner_id = auth.uid()
    )
  );

create policy "document_validations_insert_via_document" on public.document_validations
  for insert
  with check (
    validated_by = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.documents d
        where d.id = document_validations.document_id and d.owner_id = auth.uid()
      )
    )
  );

-- Sin UPDATE/DELETE: preserva la trazabilidad exigida por RF-007.
