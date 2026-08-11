# Roadmap de fases

No hay fecha de entrega fija: el orden y el contenido de cada fase son fijos, el ritmo
lo define el equipo. Cada fase se abre en su propia rama (`fase/N-nombre`), se cierra
con el reporte de `CLAUDE.md` §3 y requiere aprobación explícita antes de continuar o
integrar a `main`.

| Fase | Rama | Contenido principal | Depende de |
|---|---|---|---|
| 0 | `fase/0-planificacion` | Arquitectura, modelo de datos, estrategia OCR/entrenamiento, docs iniciales, ADR, trazabilidad (este documento) | — |
| 1 | `fase/1-base-tecnica` | Bootstrap Next.js + TypeScript, proyecto Supabase real, esquema inicial (migraciones), Auth nativo, RLS base, estructura de carpetas real, CI mínimo | Fase 0 aprobada |
| 2 | `fase/2-documentos` | Módulo `documents`: subida a Storage privado, CRUD, listado paginado con filtros (RF-004, RF-005), políticas RLS de `documents` | Fase 1 |
| 3 | `fase/3-camara` | Módulo `camera`: `getUserMedia`, fallback input file, preview, manejo de errores, validaciones de hardware (RF-001, RNF-007) | Fase 1 |
| 4a | `fase/4a-ocr-preprocesamiento` | Escala de grises, normalización, contraste, histograma, Otsu propio, binarización, morfología, reducción de ruido + unit tests | Fase 1 |
| 4b | `fase/4b-ocr-segmentacion` | Componentes conectados, proyecciones, segmentación de líneas/palabras/caracteres + unit tests | Fase 4a |
| 4c | `fase/4c-ocr-clasificacion` | HOG propio, kNN propio, confidence por carácter + unit tests con vectores conocidos | Fase 4b |
| 4d | `fase/4d-ocr-training` | OCR LAB (solo admin), etiquetado, dataset `ocr_training_samples`, primeras muestras reales/sintéticas, primer modelo `invoice_es_v1` | Fase 4c |
| 4e | `fase/4e-ocr-pipeline` | Integración end-to-end del pipeline en `workers/ocr.worker.ts`, extractor de campos `invoice_es` (RF-002, RF-003), estados de progreso reales | Fase 4c, 4d |
| 4f | `fase/4f-ocr-evaluation` | Benchmark sobre `test`, métricas reales (`docs/ocr/evaluation.md`), medición de `processing_ms` (RNF-001) | Fase 4e |
| 5 | `fase/5-validacion` | Módulo `validation`: UI de comparación, edición, confirmación, `document_validations` (RF-007) | Fase 2, 4e |
| 6 | `fase/6-administracion` | Admin dashboard, documentos de todos los usuarios, auditoría global, gestión de modelos OCR | Fase 2, 4d, 5 |
| 7 | `fase/7-testing` | Cobertura de integration/e2e restante, consolidación de test-plan, revisión de deuda técnica | Fases 1–6 |
| 8 | `fase/8-deployment` | Despliegue en Vercel, variables de entorno de producción, verificación de RNF-005 | Fase 7 |
| 9 | `fase/9-documentacion` | Documentación final para sustentación, cierre de trazabilidad, ADRs finales | Fase 8 |

## Notas

- RF-006 (integración contable) permanece `DEFERRED` en todo el roadmap salvo
  autorización explícita futura; no tiene fase asignada.
- `FUTURE-PWA` no tiene fase asignada; es solo una restricción de no cerrar puertas
  arquitectónicas, no un compromiso de entrega.
- El orden de 4a→4f es secuencial por dependencia técnica real (no se puede segmentar
  sin binarizar, no se puede clasificar sin segmentar, etc.); dentro de cada sub-fase
  puede haber `feature/` ramas si el equipo decide paralelizar trabajo aislado.
- Este roadmap se revisa y puede ajustarse al cierre de cada fase si la fase anterior
  reveló información nueva — cualquier ajuste que toque un RF/RNF sigue el protocolo de
  `CLAUDE.md` §3 (detener y pedir autorización), no se cambia en silencio.
