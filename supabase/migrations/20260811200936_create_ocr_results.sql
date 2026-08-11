-- ocr_results: salida del pipeline OCR propio para un documento (RF-002,
-- RF-003). Un documento puede tener varias ejecuciones (reintentos, cambio
-- de modelo). El acceso se resuelve siempre a traves del documento dueno.

create table public.ocr_results (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  model_id uuid references public.ocr_models (id) on delete set null,
  raw_text text not null default '',
  extracted_data jsonb not null default '{}'::jsonb,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  processing_ms integer check (processing_ms is null or processing_ms >= 0),
  created_at timestamptz not null default now()
);

create index ocr_results_document_id_idx on public.ocr_results (document_id);

alter table public.ocr_results enable row level security;

create policy "ocr_results_select_via_document" on public.ocr_results
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = ocr_results.document_id and d.owner_id = auth.uid()
    )
  );

create policy "ocr_results_insert_via_document" on public.ocr_results
  for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = ocr_results.document_id and d.owner_id = auth.uid()
    )
  );

-- Sin UPDATE/DELETE: un resultado OCR es un registro historico inmutable.
-- Correcciones humanas se guardan aparte en document_validations (RF-007).
