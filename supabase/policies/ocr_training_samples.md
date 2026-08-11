# RLS — `ocr_training_samples`

| Operación | Regla | Rationale |
|---|---|---|
| Todas (SELECT/INSERT/UPDATE/DELETE) | `is_admin()` | Dataset de entrenamiento gestionado exclusivamente desde OCR LAB (solo ADMIN). No es dato de usuario final ni debe ser visible para usuarios regulares. |

`dataset_partition` tiene `CHECK (in ('train','validation','test'))` a nivel de tabla
— la disciplina de "`test` nunca se usa para entrenar" es además una regla de proceso
de OCR LAB (Fase 4d), no solo de constraint de datos (ver `docs/ocr/training.md`).
