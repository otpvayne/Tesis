# RLS — `ocr_models`

| Operación | Regla | Rationale |
|---|---|---|
| Todas (SELECT/INSERT/UPDATE/DELETE) | `is_admin()` | No es dato de usuario final — gestión de modelos vía OCR LAB, solo ADMIN. |

Constraint adicional a nivel de datos (no RLS): índice único parcial
`ocr_models_one_active_per_type` garantiza que solo exista un modelo `active = true`
por `document_type`.
