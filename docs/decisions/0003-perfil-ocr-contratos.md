# ADR-0003: Perfil OCR de contratos (`contract_es`)

- **Estado:** Aceptado
- **Fecha:** 2026-09-08
- **Decide:** Santiago Moralez Orozco, con autorización explícita para saltarse el gate
  de `docs/roadmap.md` que bloqueaba nuevos perfiles hasta cerrar Fase 8

## Contexto

Hasta este cambio el sistema solo digitalizaba facturas (`invoice_es`, RF-003:
Proveedor, NIT, Fecha, IVA, Valor, Total). El equipo pidió agregar una sección para
digitalizar **contratos**, ahora que Tesseract.js está aprobado como motor de
reconocimiento (ADR-0002).

Esto es formalmente una expansión de alcance de RF-003 / perfiles OCR
(`CLAUDE.md` §12 la lista como algo que requiere autorización explícita). Antes de
escribir código se reportó REQUERIMIENTO AFECTADO/PROBLEMA/CAUSA/IMPACTO al equipo
(`CLAUDE.md` §3) porque `docs/roadmap.md` documentaba explícitamente que ningún perfil
nuevo arrancaría antes de (1) superar el 16.1% de accuracy real de `invoice_es` y (2)
cerrar Fase 8 -- ninguna de las dos condiciones estaba cumplida formalmente (Fase 8
sigue en cierre). El equipo confirmó avanzar de todas formas, reportando que el
pipeline propio ya medía ~80% de accuracy con 16,500 caracteres reales.

**Verificación real de esa cifra (hecha en esta sesión, no solo reportada):** se corrió
`bin/verify-active-model-accuracy.ts` (`npm run verify:model-accuracy`) -- mismo cálculo
que `evaluateActiveModelOnTestPartition` (`training-actions.ts`) pero invocable fuera
del navegador, contra el modelo activo real y la partición `test` real de
`ocr_training_samples`. Resultado medido: **73.8% de accuracy (1792/2427 caracteres),
59 clases** -- distinto del 80%/16,500 reportado (la cifra reportada probablemente
contaba train+validation+test, no solo `test`, que es la única partición que cuenta
para RF-003/`CLAUDE.md` §7/§10). El número real sigue superando ampliamente el 16.1%
que bloqueaba el roadmap, así que la condición de accuracy sí se cumple -- con el
número correcto documentado, no el reportado.

Campos obligatorios del contrato (dados por el equipo, análogos a
Proveedor/NIT/Fecha/IVA/Valor/Total de facturas): **Proveedor, NIT o documento de los
implicados, Fecha, Valor total, Vigencia, Tipo de contrato, Número de contrato.**

No existe todavía ningún dataset de contratos reales etiquetados.

## Decisión

1. **Nuevo `document_type`: `contract_es`** (`DOCUMENT_TYPES`,
   `src/modules/documents/types.ts`). Sin migración de base de datos --
   `documents.document_type` es `text not null` sin `CHECK constraint` (a diferencia de
   `status`), así que el valor nuevo no requiere tocar `supabase/migrations/`.
2. **Motor OCR: siempre Tesseract.js para `contract_es`**, sin importar
   `NEXT_PUBLIC_OCR_ENGINE` (`ocrEngineForDocumentType`,
   `src/modules/ocr/classification/document-ocr-profile.ts`). No existe (ni se entrena
   en este cambio) un modelo propio HOG+kNN para contratos -- entrenar uno repetiría
   todo el ciclo de Fase 4 (síntesis, entrenamiento, evaluación) sin datos reales
   disponibles, y Tesseract ya está aprobado para exactamente este tipo de necesidad
   (ADR-0002). `invoice_es` no cambia de comportamiento.
3. **Sin soporte de OCR LAB para `contract_es`** -- `/ocr-lab/train` y
   `training-actions.ts` siguen hardcodeados a `invoice_es`; no hace falta entrenar
   nada para un perfil que usa un motor pre-entrenado.
4. **Extracción de campos:** nuevo módulo
   `src/modules/ocr/classification/contract-field-extraction.ts`, mismo patrón
   regex+keywords+3 niveles de confianza que `field-extraction.ts` (`invoice_es`),
   reusando las primitivas compartidas extraídas a
   `field-extraction-helpers.ts`. **No verificado todavía contra contratos reales** --
   no existe dataset de contratos etiquetado; las keywords/patrones son un punto de
   partida razonable, no un resultado medido. Se ajustan cuando el equipo tenga
   contratos reales de Mansor para probar.
5. **Sección "Contratos" separada de "Documentos" en la app** (nav, lista, formulario de
   subida) -- no un selector de tipo escondido dentro del flujo de facturas:
   - `Sidebar.tsx`: nuevos links `/contracts` y `/contracts/new`.
   - `src/modules/documents/upload-form.tsx`: formulario de subida (cámara + fallback de
     archivo) extraído de `documents/new/page.tsx` para reusarlo parametrizado por tipo
     de documento en `contracts/new/page.tsx`, sin duplicar la lógica de cámara/permisos.
   - `contracts/page.tsx`: mismo patrón que `documents/page.tsx`, filtrando
     `documentType: "contract_es"` (nuevo filtro en `listDocuments`/`DocumentFilters`).
     `documents/page.tsx` ahora filtra explícitamente `documentType: "invoice_es"` para
     no mezclar ambos tipos en la misma lista.
   - El detalle/validación de un contrato sigue viviendo en `/documents/[id]` (esa
     página ya resuelve por `id`, agnóstica al perfil) -- no se duplicó esa página
     completa. Los links desde `/contracts` usan `?back=/contracts...`, mismo patrón
     que ya usan `documents/page.tsx` y `admin/documents/page.tsx`.
6. **Generalización de tipos de validación (RF-003/RF-007):**
   `VALIDATION_FIELDS_BY_DOCUMENT_TYPE` (`validation-types.ts`) reemplaza a la lista
   plana `VALIDATION_FIELDS` como fuente de "qué campos le corresponden a ESTE
   documento" (`documents/[id]/page.tsx`, `ValidationSummary`). `VALIDATION_FIELDS`
   (unión de todos los perfiles) se conserva para las vistas admin que agregan a través
   de todos los tipos de documento (`modules/admin/stats.ts`, `/admin/validations`);
   `buildValidationsReportRows` (`modules/admin/reports.ts`) también se actualizó para
   escoger los campos del perfil de cada documento (vía un nuevo embed
   `documents(document_type)` en `/api/admin/reports/validations`), en vez de asumir
   siempre los 6 campos de factura.
7. **`saveOcrResult`** (`document-processing.ts`) deja de mapear a mano los 6 campos de
   factura -- guarda dinámicamente las claves que trae `extractedData` (excluyendo los
   metadatos `rawOCR`/`extractionMethod`), sirve para cualquier perfil sin cambios
   futuros.

## Fuera de alcance de este cambio

- `/admin/documents` y `/admin/reports` (excepto el fix puntual de
  `buildValidationsReportRows` arriba) ya eran genéricos por campo/valor y no requirieron
  cambios adicionales.
- No se agregó ningún perfil más allá de `contract_es` -- "otros documentos" mencionado
  por el equipo queda para cuando haya campos concretos definidos (mismo criterio de
  `CLAUDE.md` §7: nada de inventar campos para tipos sin definir).

## Consecuencias

- RF-003 ahora cubre dos perfiles con campos propios cada uno; la matriz de
  trazabilidad y `CLAUDE.md` §7/§8 se actualizan en el mismo cambio.
- Riesgo documentado (ya señalado en ADR-0002, aplica igual aquí): usar Tesseract.js
  como motor de reconocimiento de contratos en producción debe declararse honestamente
  en la documentación final de la tesis como lo que es -- un motor de terceros, no el
  pipeline propio -- si la evaluación académica pondera el pipeline construido desde
  cero como criterio central.
- Sin dataset de contratos reales, la calidad real de `extractContractFields` es
  desconocida hasta que el equipo pruebe con contratos reales de Mansor -- mismo
  patrón de honestidad que el resto del proyecto (no se afirma precisión sin medir).
