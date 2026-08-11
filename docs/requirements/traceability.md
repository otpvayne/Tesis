# Matriz de trazabilidad de requerimientos

Estados permitidos: `PENDING`, `IN_PROGRESS`, `IMPLEMENTED`, `VERIFIED`, `BLOCKED`,
`DEFERRED`. Se actualiza al cierre de cada fase, referenciando commits reales (nunca
hashes inventados). En Fase 0 no existe código de aplicación: todo lo listado como
`PENDING` corresponde a trabajo de fases futuras; los ítems documentales de esta fase
se marcan `IMPLEMENTED` (documentación) donde aplica.

## Requerimientos funcionales

| ID | Caso de uso | Módulo | Archivos | Prueba | Estado |
|---|---|---|---|---|---|
| RF-001 | Capturar documento por cámara o selección de imagen | `modules/camera` | *(Fase 3)* | *(Fase 3)* | PENDING |
| RF-002 | Reconocer texto vía OCR propio | `modules/ocr`, `workers/ocr.worker.ts` | *(Fase 4a–4e)* | *(Fase 4a–4f)* | PENDING |
| RF-003 | Extraer proveedor, fecha, monto_total (deseado: numero_factura) para `invoice_es` | `modules/ocr/extraction` | *(Fase 4e)* | *(Fase 4e/4f)* | PENDING |
| RF-004 | Almacenar documento original + datos asociados en Supabase | `modules/documents` | esquema: `supabase/migrations/20260811200929_create_documents.sql`; bucket: `supabase/migrations/20260811205322_create_documents_storage_bucket.sql`; subida: `src/modules/documents/actions.ts`, `src/app/(dashboard)/documents/new/page.tsx` | `tests/integration/rls-isolation.test.ts` (7/7) + `tests/integration/storage-isolation.test.ts` (7/7, incluye caso ADMIN con sesión real) | VERIFIED |
| RF-005 | Consultar documentos con filtros (proveedor, fecha, monto, estado) | `modules/documents` | `src/modules/documents/queries.ts`, `src/app/(dashboard)/documents/page.tsx` | `tests/integration/document-filters.test.ts` (7/7 verde) | status/fecha **VERIFIED** con datos reales; proveedor/monto **IMPLEMENTED** (query correcta contra muestra sintética de `ocr_results`, sin datos reales que filtrar hasta RF-002/RF-003 en Fase 4/5 — no es un bug, es orden de fases) |
| RF-006 | Integración contable (SIIGO u otra) | — | — | — | **DEFERRED** |
| RF-007 | Validación humana de datos extraídos, con trazabilidad original/validado | `modules/validation` | *(Fase 5)* | *(Fase 5)* | PENDING |

## Requerimientos no funcionales

| ID | Descripción | Módulo | Archivos | Prueba | Estado |
|---|---|---|---|---|---|
| RNF-001 | Rendimiento OCR objetivo <5s, medido vía `processing_ms` | `modules/ocr` | *(Fase 4f)* | benchmark OCR sobre `test` | PENDING |
| RNF-002 | Iniciar digitalización en ≤3 interacciones principales | `app/(dashboard)`, `modules/camera` | *(Fase 3)* | e2e | PENDING |
| RNF-003 | Seguridad: Auth nativo, HTTPS, RLS, storage privado, validación de MIME/tamaño | `lib/supabase`, `modules/documents` | `src/lib/supabase/{client,server,admin}.ts`, `supabase/migrations/*.sql`, `supabase/policies/*.md`, `src/modules/documents/validation.ts` (límite 10MB, MIME real por magic bytes) | `tests/integration/rls-isolation.test.ts` (7/7) + `tests/integration/storage-isolation.test.ts` (7/7) + `tests/unit/modules/documents/validation.test.ts` (11/11) | VERIFIED |
| RNF-004 | Portabilidad: responsive, navegadores modernos desktop/móvil | `components/layout`, `app/(auth)`, `app/(dashboard)` | `src/app/(auth)/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/dashboard-nav.tsx`, `src/app/(dashboard)/documents/**` | `npm run build` (sin errores); **sin verificación visual en navegador real** — prohibido en esta sesión desde Fase 2 (`CLAUDE.md` §11), queda como verificación manual pendiente del equipo | IN_PROGRESS |
| RNF-005 | Disponibilidad (Vercel + Supabase, sin afirmar SLA no medido) | infraestructura | — | monitoreo (Fase 8) | PENDING |
| RNF-006 | Interoperabilidad: interfaces preparadas para integración contable, sin implementación ficticia | — | — | — | DEFERRED (asociado a RF-006) |
| RNF-007 | Hardware: cámara, permisos, contexto seguro, Canvas/ImageData | `modules/camera` | *(Fase 3)* | manual (dispositivos reales) | PENDING |
| RNF-008 | Escalabilidad: sin estado global innecesario, consultas paginadas, OCR no bloqueante | `modules/documents` | índices en `supabase/migrations/20260811200929_create_documents.sql`; paginación en `src/modules/documents/pagination.ts`, `src/modules/documents/queries.ts` | `tests/unit/modules/documents/pagination.test.ts` (5/5) + `tests/integration/document-filters.test.ts` (paginación implícita en `.range()`) | IN_PROGRESS (paginación de `documents` VERIFIED; "OCR no bloqueante" sigue PENDING, Fase 4e) |

## Entregables documentales de Fase 0

| Entregable | Archivo | Estado |
|---|---|---|
| Contexto persistente del proyecto | `CLAUDE.md` | IMPLEMENTED |
| Arquitectura y estructura de carpetas | `docs/architecture/overview.md` | IMPLEMENTED |
| Modelo de datos | `docs/architecture/data-model.md` | IMPLEMENTED |
| Matriz de trazabilidad | `docs/requirements/traceability.md` | IMPLEMENTED |
| Estrategia OCR (pipeline, algoritmos, entrenamiento, evaluación) | `docs/ocr/*.md` | IMPLEMENTED |
| Plan de pruebas | `docs/testing/test-plan.md` | IMPLEMENTED |
| ADR inicial | `docs/decisions/0001-arquitectura-inicial-del-sistema.md` | IMPLEMENTED |
| Roadmap de fases | `docs/roadmap.md` | IMPLEMENTED |

Ningún ítem de código de aplicación existía en Fase 0; "IMPLEMENTED" ahí se refería
exclusivamente a los documentos de planificación de esa fase, no a `VERIFIED` (que
requeriría prueba ejecutada sobre código real).

## Entregables técnicos de Fase 1

| Entregable | Archivo(s) | Prueba | Estado |
|---|---|---|---|
| Bootstrap Next.js 16 + TypeScript strict + ESLint | `package.json`, `tsconfig.json`, `eslint.config.mjs` | `npm run build`, `npx tsc --noEmit`, `npx eslint .` (todos verdes) | VERIFIED |
| Test runner (Vitest) | `vitest.config.mts`, `docs/testing/test-plan.md` §0 | `npm run test` (10/10 verde) | VERIFIED |
| Esquema de 7 tablas en Supabase real | `supabase/migrations/2026081120*.sql` | `npx supabase migration list --linked` (7/7 aplicadas) | VERIFIED |
| Políticas RLS (documentadas + activas) | `supabase/policies/*.md` | `tests/integration/rls-isolation.test.ts` (7/7 verde) | VERIFIED |
| Corrección: `profiles.role` inmutable salvo `service_role` | `supabase/migrations/20260811200926_create_profiles.sql` | `tests/integration/rls-isolation.test.ts` (caso "no puede autoasignarse ADMIN") | VERIFIED |
| Corrección: `documents.status` con `CHECK` explícito | `supabase/migrations/20260811200929_create_documents.sql` | verificado por inspección del esquema aplicado (sin test unitario dedicado) | IMPLEMENTED |
| Clientes Supabase browser/server/admin | `src/lib/supabase/{client,server,admin}.ts` | uso real desde login/registro/dashboard (`npm run build` sin errores) | IMPLEMENTED |
| Signup/login/logout con Auth nativo | `src/modules/auth/actions.ts`, `src/app/(auth)/**` | build + integración manual de rutas (`/login`, `/register` responden 200; `/` redirige 307 sin sesión) | IN_PROGRESS |
| Shell mobile-first (Login/Dashboard vacíos) | `src/app/(auth)/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/dashboard-nav.tsx` | build + revisión de código; **sin verificación visual en navegador real esta fase** (ver deuda técnica en el cierre de Fase 1) | IN_PROGRESS |

## Entregables técnicos de Fase 2

| Entregable | Archivo(s) | Prueba | Estado |
|---|---|---|---|
| Bucket privado `documents` + políticas de Storage | `supabase/migrations/20260811205322_create_documents_storage_bucket.sql`, `supabase/policies/storage_documents_bucket.md` | `tests/integration/storage-isolation.test.ts` (7/7 verde, incluye un usuario con rol ADMIN en sesión real ejercitando `is_admin()` en `storage.objects`, no solo `service_role`) | VERIFIED |
| Validación de subida (MIME real por magic bytes + límite 10MB) | `src/modules/documents/validation.ts` | `tests/unit/modules/documents/validation.test.ts` (11/11 verde) | VERIFIED |
| Crear/borrar documento (Server Actions) | `src/modules/documents/actions.ts` | `npm run build` sin errores; flujo cubierto indirectamente por `storage-isolation.test.ts`/`rls-isolation.test.ts` (mismas operaciones vía cliente anon) | IMPLEMENTED |
| Listado paginado con filtros | `src/modules/documents/{queries,pagination}.ts` | `tests/integration/document-filters.test.ts` (7/7) + `tests/unit/modules/documents/pagination.test.ts` (5/5) | VERIFIED |
| UI: nuevo documento, listado, detalle, vista admin | `src/app/(dashboard)/documents/**`, `src/app/(dashboard)/admin/documents/page.tsx` | `npm run build` sin errores; **sin verificación visual en navegador real** — prohibido en esta sesión (`CLAUDE.md` §11) | IMPLEMENTED |
| Auditoría: `DOCUMENT_CREATED`, `DOCUMENT_VIEWED`, `DOCUMENT_DELETED`, `LOGIN` | `src/modules/audit/log.ts`, usado desde `documents/actions.ts` y `auth/actions.ts` | `npm run build` sin errores; sin test dedicado a `audit_logs` esta fase (deuda técnica) | IMPLEMENTED |
| Reglas de sesión: sin `next dev`, sin herramientas de navegador | `CLAUDE.md` §11 | N/A (regla de proceso) | IMPLEMENTED |

Deuda heredada de Fase 1 (signup/login/shell) permanece `IN_PROGRESS` por el mismo motivo:
sin verificación visual en navegador real, ahora explícitamente prohibida en esta sesión
por regla del equipo (`CLAUDE.md` §11) en vez de solo pendiente — la resuelve el equipo
manualmente, no una fase futura de Claude Code.
