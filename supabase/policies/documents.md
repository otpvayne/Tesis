# RLS — `documents`

| Operación | Regla | Rationale |
|---|---|---|
| SELECT | `owner_id = auth.uid()` OR `is_admin()` | Aislamiento por usuario (RF-004/RF-005); ADMIN ve todo. |
| INSERT | `owner_id = auth.uid()` | Nadie crea un documento a nombre de otro usuario. |
| UPDATE | `owner_id = auth.uid()` OR `is_admin()` (`USING` y `WITH CHECK` iguales) | Evita que un UPDATE reasigne `owner_id` a otro usuario para "robar" el documento. |
| DELETE | `owner_id = auth.uid()` OR `is_admin()` | RF-004: el usuario elimina sus propios documentos; ADMIN por gestión. |

Este es el caso central que valida el test de aislamiento
(`tests/integration/rls-isolation.test.ts`): un `USER` autenticado con la clave `anon`
no debe poder leer ni modificar filas de `documents` cuyo `owner_id` sea otro usuario.
