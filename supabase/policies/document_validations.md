# RLS — `document_validations`

Igual patrón que `ocr_results`: acceso resuelto vía el `documents` referenciado.

| Operación | Regla | Rationale |
|---|---|---|
| SELECT | `is_admin()` OR existe `documents d` con `d.id = document_id AND d.owner_id = auth.uid()` | Ver el historial de validación de los propios documentos. |
| INSERT | `validated_by = auth.uid()` AND (`is_admin()` OR el documento es del usuario) | `validated_by` siempre es quien hace la petición — no se puede insertar una validación "a nombre de" otro usuario, ni validar el documento de otro salvo que sea ADMIN. |
| UPDATE / DELETE | *(sin policy → denegado)* | RF-007 exige conservar el original y el validado; una corrección posterior crea una fila nueva, nunca edita la anterior. |
