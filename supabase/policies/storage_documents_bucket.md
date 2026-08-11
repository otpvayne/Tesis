# RLS — bucket de Storage `documents`

Bucket privado (`public = false`), `file_size_limit = 10485760` (10 MB),
`allowed_mime_types = image/jpeg, image/png`. Estas dos restricciones son una segunda
barrera a nivel de Storage — la validación primaria (MIME real por magic bytes + tamaño)
ocurre en el servidor antes de subir, en `src/modules/documents/validation.ts`.

Convención de ruta: `{user_id}/{document_id}/original.{extension}` — el primer
segmento de la ruta (`storage.foldername(name))[1]`) es el `owner_id`, igual criterio
que las políticas de la tabla `documents`.

| Operación | Regla | Rationale |
|---|---|---|
| SELECT (descarga/URL firmada) | `is_admin()` OR primer segmento de la ruta = `auth.uid()` | Un usuario solo puede generar/usar URLs firmadas sobre sus propios objetos; ADMIN sobre todos. |
| INSERT (subida) | primer segmento de la ruta = `auth.uid()` | Nadie sube un archivo bajo el prefijo de otro usuario, ni siquiera ADMIN (ADMIN no necesita subir a nombre de otro en esta fase). |
| UPDATE | `is_admin()` OR primer segmento = `auth.uid()` | Reemplazo de un objeto propio (no usado activamente en Fase 2, previsto para consistencia). |
| DELETE | `is_admin()` OR primer segmento = `auth.uid()` | Espeja el borrado de la fila `documents` correspondiente. |

Sin test unitario de SQL (no aplica); verificado por
`tests/integration/storage-isolation.test.ts` contra el proyecto real.
