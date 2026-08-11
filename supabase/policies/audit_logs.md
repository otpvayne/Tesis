# RLS — `audit_logs`

| Operación | Regla | Rationale |
|---|---|---|
| SELECT | `actor_id = auth.uid()` OR `is_admin()` | USER consulta solo su propia auditoría; ADMIN consulta la global. |
| INSERT | `actor_id = auth.uid()` | Cualquier acción de la app (LOGIN, DOCUMENT_CREATED, etc.) se registra a nombre de quien la ejecuta — no se puede forjar un log a nombre de otro usuario. |
| UPDATE / DELETE | *(sin policy → denegado)* | Un log de auditoría es inmutable vía API — integridad de la bitácora. Cualquier purga por retención se hace fuera de RLS (`service_role`), no como funcionalidad de producto. |
