-- audit_logs: bitacora de eventos (CLAUDE.md sec. 11). USER lee solo lo
-- propio, ADMIN lee todo. Tabla de solo lectura/insercion: nadie puede
-- editar o borrar un log via la API (integridad de auditoria).

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id),
  document_id uuid references public.documents (id) on delete set null,
  action text not null check (action in (
    'LOGIN',
    'DOCUMENT_CREATED',
    'IMAGE_CAPTURED',
    'OCR_STARTED',
    'OCR_COMPLETED',
    'OCR_FAILED',
    'OCR_VALIDATED',
    'OCR_CORRECTED',
    'DOCUMENT_VIEWED',
    'DOCUMENT_DELETED',
    'MODEL_TRAINED',
    'MODEL_ACTIVATED'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_id_created_at_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_document_id_idx on public.audit_logs (document_id);

alter table public.audit_logs enable row level security;

create policy "audit_logs_select_own_or_admin" on public.audit_logs
  for select
  using (actor_id = auth.uid() or public.is_admin());

create policy "audit_logs_insert_own" on public.audit_logs
  for insert
  with check (actor_id = auth.uid());

-- Sin UPDATE/DELETE via API: un log de auditoria es inmutable.
