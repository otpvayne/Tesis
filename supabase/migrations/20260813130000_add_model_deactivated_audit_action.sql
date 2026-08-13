-- Fase 6 (admin): agrega 'MODEL_DEACTIVATED' a audit_logs.action -- hasta
-- ahora solo existia MODEL_TRAINED/MODEL_ACTIVATED, sin forma de auditar
-- que un admin desactivo un modelo desde /admin/models. Aditivo, no quita
-- ningun valor existente.

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
    'DOCUMENT_REJECTED',
    'MODEL_DEACTIVATED'
  ));
