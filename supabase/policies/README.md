# Políticas RLS por tabla

Fuente de verdad ejecutable: las migraciones en `supabase/migrations/` (cada tabla
habilita RLS y crea sus políticas en el mismo archivo que la crea). Este directorio
documenta, en lenguaje humano, la intención de cada política para facilitar su
revisión sin leer SQL — y sirve de checklist para el test de integración de
aislamiento (`tests/integration/rls-isolation.test.ts`).

Helper compartido: `public.is_admin()` (definido en `20260811200926_create_profiles.sql`)
— `security definer stable`, evita recursión de RLS al consultarse desde políticas de
otras tablas.

| Tabla | Archivo |
|---|---|
| `profiles` | [`profiles.md`](profiles.md) |
| `documents` | [`documents.md`](documents.md) |
| `ocr_results` | [`ocr_results.md`](ocr_results.md) |
| `document_validations` | [`document_validations.md`](document_validations.md) |
| `ocr_models` | [`ocr_models.md`](ocr_models.md) |
| `ocr_training_samples` | [`ocr_training_samples.md`](ocr_training_samples.md) |
| `audit_logs` | [`audit_logs.md`](audit_logs.md) |
