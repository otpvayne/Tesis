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
| RF-004 | Almacenar documento original + datos asociados en Supabase | esquema: `supabase/migrations/20260811200929_create_documents.sql`; Storage y flujo de subida: *(Fase 2)* | `tests/integration/rls-isolation.test.ts` (aislamiento de datos, no de Storage aún) | IN_PROGRESS |
| RF-005 | Consultar documentos con filtros (proveedor, fecha, monto, estado) | esquema/índices: `supabase/migrations/20260811200929_create_documents.sql`; UI de filtros: *(Fase 2)* | *(Fase 2)* | PENDING |
| RF-006 | Integración contable (SIIGO u otra) | — | — | — | **DEFERRED** |
| RF-007 | Validación humana de datos extraídos, con trazabilidad original/validado | `modules/validation` | *(Fase 5)* | *(Fase 5)* | PENDING |

## Requerimientos no funcionales

| ID | Descripción | Módulo | Archivos | Prueba | Estado |
|---|---|---|---|---|---|
| RNF-001 | Rendimiento OCR objetivo <5s, medido vía `processing_ms` | `modules/ocr` | *(Fase 4f)* | benchmark OCR sobre `test` | PENDING |
| RNF-002 | Iniciar digitalización en ≤3 interacciones principales | `app/(dashboard)`, `modules/camera` | *(Fase 3)* | e2e | PENDING |
| RNF-003 | Seguridad: Auth nativo, HTTPS, RLS, storage privado, validación de MIME/tamaño | Auth+RLS: `src/lib/supabase/{client,server,admin}.ts`, `supabase/migrations/*.sql`, `supabase/policies/*.md`; storage privado y validación de MIME/tamaño: *(Fase 2)* | `tests/integration/rls-isolation.test.ts` (7/7 verde contra el proyecto real) | IN_PROGRESS |
| RNF-004 | Portabilidad: responsive, navegadores modernos desktop/móvil | `src/app/(auth)/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/dashboard-nav.tsx` | manual (`npm run dev`, sin recorrido en navegador real esta fase — ver cierre de Fase 1) + e2e *(Fase 3)* | IN_PROGRESS |
| RNF-005 | Disponibilidad (Vercel + Supabase, sin afirmar SLA no medido) | infraestructura | — | monitoreo (Fase 8) | PENDING |
| RNF-006 | Interoperabilidad: interfaces preparadas para integración contable, sin implementación ficticia | — | — | — | DEFERRED (asociado a RF-006) |
| RNF-007 | Hardware: cámara, permisos, contexto seguro, Canvas/ImageData | `modules/camera` | *(Fase 3)* | manual (dispositivos reales) | PENDING |
| RNF-008 | Escalabilidad: sin estado global innecesario, consultas paginadas, OCR no bloqueante | índices `documents(owner_id, created_at)`/`(status)`/`(document_type)` en `supabase/migrations/20260811200929_create_documents.sql`; consultas paginadas y no bloqueo de OCR: *(Fase 2, 4e)* | *(Fase 2, 4e)* | PENDING |

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
