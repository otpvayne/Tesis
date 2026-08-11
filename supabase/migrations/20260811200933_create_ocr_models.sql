-- ocr_models: modelos entrenados propios (HOG+kNN), uno activo por tipo
-- documental. Solo ADMIN gestiona esta tabla (OCR LAB) — no es dato de
-- usuario final.

create table public.ocr_models (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  version text not null,
  model_data jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (document_type, version)
);

comment on column public.ocr_models.model_data is 'Vecinos kNN + metadatos del modelo. Formato definitivo se confirma en Fase 4c; jsonb elegido por flexibilidad, revisar si el volumen exige bytea.';

-- Solo un modelo activo por tipo documental.
create unique index ocr_models_one_active_per_type
  on public.ocr_models (document_type)
  where active;

alter table public.ocr_models enable row level security;

create policy "ocr_models_admin_all" on public.ocr_models
  for all
  using (public.is_admin())
  with check (public.is_admin());
