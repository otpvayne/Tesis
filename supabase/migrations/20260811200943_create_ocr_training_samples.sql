-- ocr_training_samples: muestras etiquetadas por OCR LAB (Fase 4d). Solo
-- ADMIN; no es dato de usuario final. dataset_partition con CHECK explicito,
-- igual que documents.status.

create table public.ocr_training_samples (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  label text not null,
  feature_data jsonb not null default '{}'::jsonb,
  dataset_partition text not null check (dataset_partition in ('train', 'validation', 'test')),
  created_at timestamptz not null default now()
);

create index ocr_training_samples_type_partition_idx
  on public.ocr_training_samples (document_type, dataset_partition);

alter table public.ocr_training_samples enable row level security;

create policy "ocr_training_samples_admin_all" on public.ocr_training_samples
  for all
  using (public.is_admin())
  with check (public.is_admin());
