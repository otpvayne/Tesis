# RLS — `ocr_results`

No tiene `owner_id` propio: el acceso se resuelve siempre a través del `documents`
referenciado por `document_id`.

| Operación | Regla | Rationale |
|---|---|---|
| SELECT | `is_admin()` OR existe `documents d` con `d.id = document_id AND d.owner_id = auth.uid()` | El usuario ve los resultados OCR de sus propios documentos. |
| INSERT | Igual condición que SELECT | El pipeline OCR corre en el navegador (Web Worker); el guardado del resultado lo hace el propio usuario dueño del documento (o ADMIN). |
| UPDATE / DELETE | *(sin policy → denegado)* | Un resultado OCR es un registro histórico inmutable. Correcciones humanas van a `document_validations`, nunca sobrescriben `ocr_results` (RF-007). |
