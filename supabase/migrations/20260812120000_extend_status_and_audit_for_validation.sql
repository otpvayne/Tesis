-- Fase 5 (validacion humana, RF-007): agrega el estado 'rejected' a
-- documents.status (para "Rechazar documento" en la UI de validacion) y la
-- accion 'DOCUMENT_REJECTED' a audit_logs.action. Ambos CHECK quedan
-- ampliados de forma aditiva -- no se quita ningun valor existente, ninguna
-- fila actual deja de cumplir el constraint.

alter table public.documents drop constraint documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('uploaded', 'processing', 'processed', 'validated', 'failed', 'rejected'));

alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check
  check (action in (
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
    'MODEL_ACTIVATED',
    'DOCUMENT_REJECTED'
  ));
