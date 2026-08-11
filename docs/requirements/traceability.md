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
| RF-004 | Almacenar documento original + datos asociados en Supabase | `modules/documents`, Storage | *(Fase 2)* | *(Fase 2)* | PENDING |
| RF-005 | Consultar documentos con filtros (proveedor, fecha, monto, estado) | `modules/documents` | *(Fase 2)* | *(Fase 2)* | PENDING |
| RF-006 | Integración contable (SIIGO u otra) | — | — | — | **DEFERRED** |
| RF-007 | Validación humana de datos extraídos, con trazabilidad original/validado | `modules/validation` | *(Fase 5)* | *(Fase 5)* | PENDING |

## Requerimientos no funcionales

| ID | Descripción | Módulo | Archivos | Prueba | Estado |
|---|---|---|---|---|---|
| RNF-001 | Rendimiento OCR objetivo <5s, medido vía `processing_ms` | `modules/ocr` | *(Fase 4f)* | benchmark OCR sobre `test` | PENDING |
| RNF-002 | Iniciar digitalización en ≤3 interacciones principales | `app/(dashboard)`, `modules/camera` | *(Fase 3)* | e2e | PENDING |
| RNF-003 | Seguridad: Auth nativo, HTTPS, RLS, storage privado, validación de MIME/tamaño | `lib/supabase`, `supabase/policies` | *(Fase 1–2)* | integration | PENDING |
| RNF-004 | Portabilidad: responsive, navegadores modernos desktop/móvil | `components/`, `app/` | *(Fase 1–3)* | manual + e2e | PENDING |
| RNF-005 | Disponibilidad (Vercel + Supabase, sin afirmar SLA no medido) | infraestructura | — | monitoreo (Fase 8) | PENDING |
| RNF-006 | Interoperabilidad: interfaces preparadas para integración contable, sin implementación ficticia | — | — | — | DEFERRED (asociado a RF-006) |
| RNF-007 | Hardware: cámara, permisos, contexto seguro, Canvas/ImageData | `modules/camera` | *(Fase 3)* | manual (dispositivos reales) | PENDING |
| RNF-008 | Escalabilidad: sin estado global innecesario, consultas paginadas, OCR no bloqueante | `modules/documents`, `workers/` | *(Fase 2, 4e)* | integration | PENDING |

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

Ningún ítem de código de aplicación existe todavía; "IMPLEMENTED" aquí se refiere
exclusivamente a los documentos de planificación de esta fase, no a `VERIFIED` (que
requeriría prueba ejecutada sobre código real).
