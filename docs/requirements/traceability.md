# Matriz de trazabilidad de requerimientos

Estados permitidos: `PENDING`, `IN_PROGRESS`, `IMPLEMENTED`, `VERIFIED`, `BLOCKED`,
`DEFERRED`. Se actualiza al cierre de cada fase, referenciando commits reales (nunca
hashes inventados). En Fase 0 no existe código de aplicación: todo lo listado como
`PENDING` corresponde a trabajo de fases futuras; los ítems documentales de esta fase
se marcan `IMPLEMENTED` (documentación) donde aplica.

## Requerimientos funcionales

| ID | Caso de uso | Módulo | Archivos | Prueba | Estado |
|---|---|---|---|---|---|
| RF-001 | Capturar documento por cámara o selección de imagen | `modules/camera` | `src/modules/camera/{errors,availability,resolution,use-camera-stream,CameraCapture}.{ts,tsx}`, `src/app/(dashboard)/documents/new/page.tsx` | lógica pura: `tests/unit/modules/camera/*.test.ts` (18/18 verde); captura/preview/stream real: **sin test automatizado posible** (jsdom no implementa `getUserMedia`/`<video>`), pendiente de verificación manual — ver checklist en el cierre de Fase 3 | IMPLEMENTED (no VERIFIED) |
| RF-002 | Reconocer texto vía OCR propio | `modules/ocr` | preprocesamiento (4a): `src/modules/ocr/preprocessing/*.ts`; segmentación (4b): `src/modules/ocr/segmentation/*.ts`, `src/modules/ocr/config.ts`; clasificación + entrenamiento sintético (4c/4d): `src/modules/ocr/classification/*.ts`; pipeline completo (4e): `src/modules/ocr/pipeline/ocr-pipeline.ts` | preprocesamiento: `tests/unit/modules/ocr/preprocessing/*.test.ts` (53/53); segmentación: `tests/unit/modules/ocr/segmentation/*.test.ts` (40/40); clasificación/entrenamiento/extracción: `tests/unit/modules/ocr/classification/*.test.ts` (53/53); pipeline: `tests/unit/modules/ocr/pipeline/*.test.ts` (5/5) | IN_PROGRESS — preprocesamiento (4a), segmentación (4b), clasificación (4c), infraestructura de entrenamiento (4d) y pipeline completo (4e) **VERIFIED** (algoritmos correctos, medido con `ImageData` sintética real — no requiere canvas de navegador salvo `decodeImage`); evaluación real sobre `test` sigue PENDING (Fase 4f) |
| RF-003 | Extracción de campos obligatorios: Proveedor, NIT, Fecha, IVA, Valor, Total (actualizado Fase 4e con datos reales de Mansor; especificado según facturación colombiana — reemplaza la definición de Fase 0 `proveedor/fecha/monto_total` + `numero_factura` deseado) para `invoice_es` | `src/modules/ocr/classification/field-extraction.ts` | `tests/unit/modules/ocr/classification/field-extraction.test.ts` (9/9, incluye el ejemplo exacto del prompt de esta fase y el caso `Total`/`Subtotal`) | VERIFIED (heurística correcta sobre texto sintético; sin facturas reales de Mansor probadas todavía) |
| RF-004 | Almacenar documento original + datos asociados en Supabase | `modules/documents` | esquema: `supabase/migrations/20260811200929_create_documents.sql`; bucket: `supabase/migrations/20260811205322_create_documents_storage_bucket.sql`; subida: `src/modules/documents/actions.ts`, `src/app/(dashboard)/documents/new/page.tsx` | `tests/integration/rls-isolation.test.ts` (7/7) + `tests/integration/storage-isolation.test.ts` (7/7, incluye caso ADMIN con sesión real) | VERIFIED |
| RF-005 | Consultar documentos con filtros (proveedor, fecha, monto, estado) | `modules/documents` | `src/modules/documents/queries.ts`, `src/app/(dashboard)/documents/page.tsx` | `tests/integration/document-filters.test.ts` (7/7 verde) | status/fecha **VERIFIED** con datos reales; proveedor/monto **IMPLEMENTED** (query correcta contra muestra sintética de `ocr_results`, sin datos reales que filtrar hasta RF-002/RF-003 en Fase 4/5 — no es un bug, es orden de fases) |
| RF-006 | Integración contable (SIIGO u otra) | — | — | — | **DEFERRED** |
| RF-007 | Validación humana de datos extraídos, con trazabilidad original/validado | `modules/validation` | *(Fase 5)* | *(Fase 5)* | PENDING |

## Requerimientos no funcionales

| ID | Descripción | Módulo | Archivos | Prueba | Estado |
|---|---|---|---|---|---|
| RNF-001 | Rendimiento OCR objetivo <5s, medido vía `processing_ms` | `modules/ocr/pipeline/ocr-pipeline.ts`, `modules/ocr/classification/field-extraction.ts` | Benchmark real de Fase 4e (ver `docs/ocr/extraction.md` §6): factura sintética de ~25 líneas/~1184 caracteres, `KNNClassifier` a escala Fase 4d (9920 muestras). Medido con `performance.now()`, no estimado: preprocess 43.7ms + segmentación 88.5ms + reconocimiento 4715.7ms + extracción 1.0ms = **4849.2ms total**. | IN_PROGRESS — dentro del objetivo <5s pero con margen mínimo (~150ms), medido en máquina de desarrollo, no en el dispositivo móvil real de RNF-004; riesgo real para Fase 4f si el dataset de entrenamiento crece (más muestras reales etiquetadas por Andrés/Santiago en paralelo) sin optimizar `KNNClassifier.predict` (`O(N·D)`, escaneo lineal, ya señalado como riesgo en Fase 4c/4d). Medición final con `test` real sigue PENDING de Fase 4f. |
| RNF-002 | Iniciar digitalización en ≤3 interacciones principales | `app/(dashboard)`, `modules/camera` | `src/app/(dashboard)/documents/new/page.tsx` (cámara se activa automáticamente al entrar; capturar → confirmar → subir) | conteo de interacciones por revisión de código, no medido en dispositivo real; e2e sigue *(Fase 7)* | IMPLEMENTED (no VERIFIED) |
| RNF-003 | Seguridad: Auth nativo, HTTPS, RLS, storage privado, validación de MIME/tamaño | `lib/supabase`, `modules/documents` | `src/lib/supabase/{client,server,admin}.ts`, `supabase/migrations/*.sql`, `supabase/policies/*.md`, `src/modules/documents/validation.ts` (límite 10MB, MIME real por magic bytes) | `tests/integration/rls-isolation.test.ts` (7/7) + `tests/integration/storage-isolation.test.ts` (7/7) + `tests/unit/modules/documents/validation.test.ts` (11/11) | VERIFIED |
| RNF-004 | Portabilidad: responsive, navegadores modernos desktop/móvil | `components/layout`, `app/(auth)`, `app/(dashboard)` | `src/app/(auth)/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/dashboard-nav.tsx`, `src/app/(dashboard)/documents/**` | `npm run build` (sin errores); **sin verificación visual en navegador real** — prohibido en esta sesión desde Fase 2 (`CLAUDE.md` §11), queda como verificación manual pendiente del equipo | IN_PROGRESS |
| RNF-005 | Disponibilidad (Vercel + Supabase, sin afirmar SLA no medido) | infraestructura | — | monitoreo (Fase 8) | PENDING |
| RNF-006 | Interoperabilidad: interfaces preparadas para integración contable, sin implementación ficticia | — | — | — | DEFERRED (asociado a RF-006) |
| RNF-007 | Hardware: cámara, permisos, contexto seguro, Canvas/ImageData | `modules/camera` | `src/modules/camera/{availability,use-camera-stream,resolution}.ts` | manual (dispositivos reales) — checklist concreto en el cierre de Fase 3 | IMPLEMENTED (no VERIFIED) |
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

## Entregables técnicos de Fase 3

| Entregable | Archivo(s) | Prueba | Estado |
|---|---|---|---|
| Clasificador de errores de cámara (DOMException → mensaje en español) | `src/modules/camera/errors.ts` | `tests/unit/modules/camera/errors.test.ts` (7/7 verde) | VERIFIED |
| Chequeo de disponibilidad (contexto seguro, soporte del navegador) | `src/modules/camera/availability.ts` | `tests/unit/modules/camera/availability.test.ts` (3/3 verde) | VERIFIED |
| Validador de resolución mínima | `src/modules/camera/resolution.ts` | `tests/unit/modules/camera/resolution.test.ts` (6/6 verde) | VERIFIED |
| Hook de ciclo de vida del `MediaStream` (permiso, preview, `track.stop()`) | `src/modules/camera/use-camera-stream.ts` | **sin test automatizado posible** (jsdom no implementa `getUserMedia`) — build/typecheck limpios, sin ejecución real | IMPLEMENTED (no VERIFIED) |
| UI de captura (activar, preview, capturar, repetir, confirmar) | `src/modules/camera/CameraCapture.tsx` | ídem — sin `<video>`/`<canvas>` real en esta sesión | IMPLEMENTED (no VERIFIED) |
| Integración en Nuevo documento (cámara + fallback de archivo, mismo `createDocument`) | `src/app/(dashboard)/documents/new/page.tsx` | `npm run build` sin errores; revisión de código detectó y corrigió 2 bugs reales antes de commitear (ver cierre de fase) — sin interacción real de usuario | IMPLEMENTED (no VERIFIED) |

### Checklist de verificación manual pendiente (equipo, dispositivo real)

Nada de esto se puede automatizar en esta sesión (`CLAUDE.md` §11 + jsdom sin
`getUserMedia`). El equipo debe probar, como mínimo:

1. **Android (Chrome) y iPhone (Safari)**, sobre HTTPS real (Vercel) o `localhost`:
   activar cámara → se pide permiso → preview en vivo se ve correctamente orientado.
2. **Denegar el permiso** deliberadamente → aparece el mensaje en español de
   `PERMISSION_DENIED`, no un error crudo del navegador, y la app cae al selector de
   archivo sin quedar en un estado roto.
3. **Capturar una foto** → preview estático se ve, "Repetir foto" vuelve al video en
   vivo sin re-pedir permiso, "Usar esta foto" adjunta la imagen y el formulario queda
   listo para subir.
4. **Dispositivo con una sola cámara** (o desktop con webcam frontal única): confirmar
   que `facingMode: { ideal: 'environment' }` no rompe la captura (debe usar la cámara
   disponible, no fallar).
5. **Verificar con las herramientas del navegador** (o `chrome://webrtc-internals`)
   que el `MediaStream` se detiene (no queda el LED de cámara encendido) al confirmar,
   al cancelar, y al navegar fuera de `/documents/new` sin hacer ninguna de las dos.
6. **Navegador sin `getUserMedia`** o **sin HTTPS/`localhost`**: confirmar que la app
   no intenta mostrar cámara y usa directamente el `<input type="file" capture>` de
   fallback.
7. **Contar las interacciones reales** desde el Dashboard hasta tener la foto lista
   para subir, en un celular real, para verificar RNF-002 (≤3) con datos reales en vez
   de una cuenta hecha por revisión de código.

## Entregables técnicos de Fase 4a

| Entregable | Archivo(s) | Prueba | Estado |
|---|---|---|---|
| `createImageData` (constructor compatible jsdom/navegador) | `src/modules/ocr/preprocessing/create-image-data.ts` | usado por todos los tests de abajo — sin test propio, es infraestructura de test | IMPLEMENTED |
| `toGrayscale` (luminancia ITU-R BT.601) | `src/modules/ocr/preprocessing/grayscale.ts` | `tests/unit/modules/ocr/preprocessing/grayscale.test.ts` (8/8 verde) | VERIFIED |
| `normalizeRange` (estiramiento min-max) | `src/modules/ocr/preprocessing/normalize.ts` | `tests/unit/modules/ocr/preprocessing/normalize.test.ts` (6/6 verde) | VERIFIED |
| `computeHistogram` (256 bins + media/desviación/mediana exactas) | `src/modules/ocr/preprocessing/histogram.ts` | `tests/unit/modules/ocr/preprocessing/histogram.test.ts` (5/5 verde) | VERIFIED |
| `computeOtsuThreshold` / `otsuBinarization` (Otsu propio, O(256)) | `src/modules/ocr/preprocessing/otsu-binarization.ts` | `tests/unit/modules/ocr/preprocessing/otsu-binarization.test.ts` (8/8 verde) | VERIFIED |
| `denoise` (filtro de mediana, padding por replicación) | `src/modules/ocr/preprocessing/denoise.ts` | `tests/unit/modules/ocr/preprocessing/denoise.test.ts` (7/7 verde) | VERIFIED |
| Pipeline completo encadenado (grayscale→normalize→otsu→denoise) | — (test de integración) | `tests/unit/modules/ocr/preprocessing/pipeline.test.ts` (4/4 verde) | VERIFIED |
| `decodeImage` (createImageBitmap + canvas) | `src/modules/ocr/preprocessing/decode-image.ts` | manejo de errores real: `tests/unit/modules/ocr/preprocessing/decode-image.test.ts` (4/4 verde); **decodificación real de un JPG/PNG: sin test posible** (jsdom no implementa `createImageBitmap` ni un contexto 2D real) | IMPLEMENTED (no VERIFIED) |
| `docs/ocr/algorithms.md` §1-5 con fórmulas reales, pseudocódigo y ejemplo numérico | `docs/ocr/algorithms.md` | ejemplos tomados directo de los tests arriba, no inventados aparte | VERIFIED |
| OCR Lab preview (`/ocr-lab/preview`, gateado a ADMIN) | `src/app/(dashboard)/ocr-lab/preview/{page,ocr-preview-client}.tsx` | `npm run build` sin errores; **sin verificación visual** — capturas de pantalla las toma el equipo manualmente en Vercel (pedido explícito de esta fase) | IMPLEMENTED (no VERIFIED) |

### Qué queda genuinamente sin verificar de Fase 4a (y por qué)

`decodeImage` es la única función de Fase 4a cuyo comportamiento real (¿decodifica un
JPG/PNG de verdad y produce los píxeles correctos?) no se pudo verificar con test
automatizado: jsdom no implementa `createImageBitmap` ni un `<canvas>` con contexto 2D
real (verificado antes de escribir el código, no asumido — ver nota al inicio de
`decode-image.test.ts`). Sus tests cubren honestamente solo el manejo de errores
(navegador sin soporte, archivo corrupto, sin contexto 2D), usando el comportamiento
real de jsdom en esos casos, no mocks que finjan que la decodificación funciona. El
resto del pipeline (grayscale → denoise) sí está 100% verificado porque opera sobre
`ImageData` — una estructura de datos pura, no dependiente de renderizado real — que se
puede construir sintéticamente en los tests con el mismo resultado que produciría un
canvas real.

La UI de `/ocr-lab/preview` tampoco tiene verificación visual (prohibido en esta sesión,
`CLAUDE.md` §11) — el equipo debe abrirla en Vercel, cargar una factura real, y
confirmar que cada botón (Grayscale/Normalizar/Otsu/Denoise) produce visualmente lo
esperado, capturando pantallazos como evidencia.

## Entregables técnicos de Fase 4b

| Entregable | Archivo(s) | Prueba | Estado |
|---|---|---|---|
| `OCR_CONFIG` (parámetros centralizados, documentados) | `src/modules/ocr/config.ts` | usado por todo lo de abajo; referencia `MIN_RESOLUTION` desde `camera/resolution.ts` sin duplicar el número | IMPLEMENTED |
| `findConnectedComponents` (8-conectividad, BFS O(n)) | `src/modules/ocr/segmentation/connected-components.ts` | `tests/unit/modules/ocr/segmentation/connected-components.test.ts` (6/6) | VERIFIED |
| `computeProjections` | `src/modules/ocr/segmentation/projections.ts` | `tests/unit/modules/ocr/segmentation/projections.test.ts` (5/5) | VERIFIED |
| `extractLines` (valles horizontales) | `src/modules/ocr/segmentation/extract-lines.ts` | `tests/unit/modules/ocr/segmentation/extract-lines.test.ts` (6/6) | VERIFIED |
| `extractWordsFromLine` (valles verticales por línea) | `src/modules/ocr/segmentation/extract-words.ts` | `tests/unit/modules/ocr/segmentation/extract-words.test.ts` (5/5) | VERIFIED |
| `extractCharactersFromWord` (1 componente = 1 carácter + filtros) | `src/modules/ocr/segmentation/extract-characters.ts` | `tests/unit/modules/ocr/segmentation/extract-characters.test.ts` (6/6, incluye aislamiento de píxeles verificado a mano con una forma en L) | VERIFIED |
| `normalizeCharacter` (resize nearest-neighbor, aspect ratio preservado) | `src/modules/ocr/segmentation/normalize-character.ts` | `tests/unit/modules/ocr/segmentation/normalize-character.test.ts` (5/5, incluye caso 1×2→4×4 calculado a mano) | VERIFIED |
| `ensureTextIsForeground` (corrección de polaridad texto/fondo) | `src/modules/ocr/segmentation/normalize-polarity.ts` | `tests/unit/modules/ocr/segmentation/normalize-polarity.test.ts` (5/5) | VERIFIED |
| Pipeline 4a+4b completo (preprocesamiento → polaridad → segmentación → normalización) | — (test de integración) | `tests/unit/modules/ocr/segmentation/pipeline.test.ts` (2/2, incluye test de regresión del bug de polaridad) | VERIFIED |
| `docs/ocr/algorithms.md` §7–11 con fórmulas reales, pseudocódigo y limitaciones documentadas | `docs/ocr/algorithms.md` | ejemplos tomados directo de los tests arriba | VERIFIED |
| UI de segmentación en `/ocr-lab/preview` (bounding boxes, líneas, palabras, grid de caracteres, normalizar) | `src/app/(dashboard)/ocr-lab/preview/ocr-preview-client.tsx` | `npm run build` sin errores; **sin verificación visual** — capturas las toma el equipo manualmente en Vercel | IMPLEMENTED (no VERIFIED) |

### Bug real encontrado y corregido en esta fase: polaridad texto/fondo

Al diseñar el test de integración 4a+4b (no al ejecutar en producción) se encontró que
`otsuBinarization` (Fase 4a) no garantiza que el texto quede en `255` — en una factura
típica (papel claro, tinta oscura) el texto es la clase minoritaria y más oscura, así
que queda en `0`. `findConnectedComponents` asume `255` = primer plano. Sin corrección,
la segmentación habría encontrado el papel en blanco como si fuera el contenido. Se
corrigió con `ensureTextIsForeground` (heurística: invertir si el blanco es
mayoritario), con un test de regresión explícito que reproduce el bug sin la corrección
(ver `docs/ocr/algorithms.md` §10).

### Limitaciones conocidas documentadas (no bugs — comportamiento del algoritmo tal como se especificó)

1. **1 componente = 1 carácter**: si un carácter se fractura en varios componentes
   (ej. una "í" con el punto separado por binarización imperfecta), o si dos caracteres
   se tocan y quedan fusionados en un único componente, esta fase no re-funde ni
   re-parte. Válido para facturas impresas bien definidas; a revisar con datos reales
   (Fase 4d/4f).
2. **Umbral simple de palabras**: con `VERTICAL_VALLEY_THRESHOLD = 2`, una sola columna
   vacía entre dos caracteres que se tocan ya se lee como fin de palabra — no hay
   distinción entre "hueco de una letra a otra" y "espacio real entre palabras" por
   ancho del hueco. Implementación fiel a lo especificado; limitación del enfoque, no
   error de código.

### Qué debe revisar el equipo con una factura real de Mansor (pedido explícito de esta fase)

Al abrir `/ocr-lab/preview` con una factura real, avisar si:

- Caracteres aparecen fracturados (un componente = medio carácter visualmente).
- Líneas o palabras no se segmentan correctamente (valles mal identificados — podría
  requerir ajustar `HORIZONTAL_VALLEY_THRESHOLD`/`VERTICAL_VALLEY_THRESHOLD` en
  `modules/ocr/config.ts`).
- Caracteres muy pequeños se pierden (por debajo de `CHAR_MIN_HEIGHT = 10`).

Esa retroalimentación real es la que debe informar qué parámetros ajustar antes de
Fase 4c (clasificación) — ningún valor de `OCR_CONFIG` está calibrado con datos reales
todavía, son puntos de partida razonables, no resultados medidos.

## Entregables técnicos de Fase 4c

| Entregable | Archivo(s) | Prueba | Estado |
|---|---|---|---|
| `extractHOG` (HOG propio, grilla 4×3×9=108) | `src/modules/ocr/classification/hog-extractor.ts` | `tests/unit/modules/ocr/classification/hog-extractor.test.ts` (5/5, incluye borde diagonal verificado a mano: pico en bin 140°) | VERIFIED |
| `KNNClassifier` (kNN propio, voto ponderado por distancia + confidence + topN) | `src/modules/ocr/classification/knn-classifier.ts` | `tests/unit/modules/ocr/classification/knn-classifier.test.ts` (10/10, incluye caso a mano de voto ponderado ganando sobre conteo simple) | VERIFIED |
| `CharacterClassifier` (HOG + kNN combinados) | `src/modules/ocr/classification/character-classifier.ts` | `tests/unit/modules/ocr/classification/character-classifier.test.ts` (2/2, integral: dos formas sintéticas distintas clasificadas correctamente) | VERIFIED |
| `Dataset`/`TrainingSample` (split estratificado train/test en memoria) | `src/modules/ocr/classification/dataset.ts` | `tests/unit/modules/ocr/classification/dataset.test.ts` (6/6) | VERIFIED |
| `OCR_CONFIG`: `HOG_GRID_COLS/ROWS`, `HOG_ORIENTATION_BINS`, `HOG_EPSILON`, `KNN_K`, `KNN_EPSILON` | `src/modules/ocr/config.ts` | usado por todo lo de arriba | IMPLEMENTED |
| `docs/ocr/algorithms.md` §12-14 con fórmulas reales, desviación del diseño de HOG documentada, ejemplos numéricos | `docs/ocr/algorithms.md` | ejemplos tomados directo de los tests arriba | VERIFIED |
| OCR Lab Training (`/ocr-lab/train`, gateado a ADMIN): grid de caracteres, etiquetado manual, guardado en `ocr_training_samples` (Supabase), progreso, entrenar + accuracy | `src/app/(dashboard)/ocr-lab/train/**` | `npm run build` sin errores; **sin verificación visual** — el equipo prueba en Vercel | IMPLEMENTED (no VERIFIED) |

### Desviación del diseño original: HOG de 108 dims vía grilla directa, no celdas+bloques con solape

El prompt de esta fase pedía celdas de 4px (grilla 8×8) + bloques de 2×2 celdas con
solape del 50%, reducidos "a 108 dims" por sub-muestreo. Verificado que esa ruta da
1764 valores (49 bloques × 36) de forma matemáticamente correcta, pero **no existe
ninguna reducción limpia de 1764 (o de la grilla 8×8) a 108 = 12×9** — 12 regiones no
factoriza en potencias de 2, los únicos divisores enteros de 32px. Implementar el HOG
completo de 1764-dim solo para descartarlo con un sub-muestreo arbitrario habría sido
complejidad sin uso real. Se implementó en su lugar una grilla directa de 4×3=12
regiones (mismas fórmulas de gradiente/orientación/normalización L2, sin la etapa de
bloques con solape), dando el mismo total de 108 dims que pedía el diseño original.
Detalle completo y ejemplo numérico en `docs/ocr/algorithms.md` §12.

### Corrección de fórmula: peso de voto kNN usa epsilon, no "+1"

El prompt de esta fase especificaba `peso = 1 / (1 + distancia)` en su pseudocódigo,
pero pedía a la vez `KNN_EPSILON: 0.001` en `OCR_CONFIG` — inconsistente entre sí (con
"+1" el epsilon nunca se usaría). El diseño ya documentado en `docs/ocr/algorithms.md`
§13 desde Fase 0 usa `peso = 1 / (distancia + epsilon)`, consistente con el parámetro
pedido; se implementó esa fórmula (ya existente en el documento, no inventada para
resolver la inconsistencia).

### Riesgo real detectado (no bug, medición honesta): rendimiento de kNN sin índice espacial

Ver RNF-001 arriba — `predict()` mide ~16.4ms a escala de dataset completo de Fase 4d
(8060 muestras sintéticas), no los <1ms especulados al pedir la fase. En serie sobre
~700 caracteres de una factura, eso supera el objetivo de <5s de RNF-001. Fase 4e
(pipeline en Web Worker) necesita abordar esto — con Web Worker (no bloquea el hilo
principal, cumple RNF-008) y/o optimizando la búsqueda de vecinos (ej. limitar
candidatos por proximidad de bounding box antes de kNN, o una estructura espacial) si
el benchmark real sobre dataset de Fase 4d confirma el problema. No se resuelve en esta
fase (alcance explícito: solo infraestructura de clasificación) — se deja documentado
para que Fase 4e no lo descubra tarde.

### Qué debe revisar el equipo (pedido explícito de esta fase)

Al abrir `/ocr-lab/train` con caracteres segmentados reales, avisar si:

- El etiquetado manual (dropdown `0-9/A-Z/a-z`) es usable en un dispositivo real
  (móvil incluido, por RNF-004).
- El guardado en `ocr_training_samples` funciona contra Supabase real (no solo build
  sin errores).
- Entrenar con las primeras muestras etiquetadas produce un resultado razonable — sin
  dataset real todavía, ninguna cifra de accuracy de esta fase es representativa del
  modelo final (Fase 4d).

## Entregables técnicos de Fase 4d

| Entregable | Archivo(s) | Prueba | Estado |
|---|---|---|---|
| `distortions.ts` (rotación, escala, skew, ruido — funciones puras) | `src/modules/ocr/classification/distortions.ts` | `tests/unit/modules/ocr/classification/distortions.test.ts` (9/9, incluye rotación de 90° verificada exacta contra la matriz de rotación) | VERIFIED |
| `dataset-synthesizer.ts` (`synthesizeDataset`, `renderCharacterGlyph`) | `src/modules/ocr/classification/dataset-synthesizer.ts` | orquestación: `dataset-synthesizer.test.ts` (5/5, con renderer inyectado); `renderCharacterGlyph` (Canvas 2D real): **sin test posible en esta sesión** (mismo límite que `decodeImage`, Fase 4a — ver nota de sesión abajo) | IMPLEMENTED (no VERIFIED end-to-end) |
| `model-trainer.ts` (`trainModel`: split estratificado, accuracy/precision/recall/confusion matrix) | `src/modules/ocr/classification/model-trainer.ts` | `tests/unit/modules/ocr/classification/model-trainer.test.ts` (4/4, incluye matriz de confusión con un error deliberado verificado a mano) | VERIFIED |
| `model-persistence.ts` (`serializeModel`/`deserializeModel`) | `src/modules/ocr/classification/model-persistence.ts` | `tests/unit/modules/ocr/classification/model-persistence.test.ts` (3/3) | VERIFIED |
| `KNNClassifier.toJSON`/`fromJSON`, `CharacterClassifier.toJSON`/`fromJSON` (soporte de serialización, Fase 4c extendida) | `src/modules/ocr/classification/{knn-classifier,character-classifier}.ts` | cubierto por `model-persistence.test.ts` | VERIFIED |
| `saveSyntheticModel` (Server Action, persiste en `ocr_models`, no en un bucket Storage nuevo) | `src/modules/ocr/classification/training-actions.ts` | `npm run build` sin errores; **sin verificación contra Supabase real** — el equipo lo prueba en `/ocr-lab/train` | IMPLEMENTED (no VERIFIED) |
| `OCR_TRAINING_CONFIG` | `src/modules/ocr/config.ts` | usado por todo lo de arriba | IMPLEMENTED |
| UI: sección "Dataset sintético" en `/ocr-lab/train` (generar+entrenar, matriz de confusión, guardar/descargar modelo) | `src/app/(dashboard)/ocr-lab/train/synthetic-training-panel.tsx` | `npm run build` sin errores; **sin verificación visual ni ejecución real** — requiere navegador real (Canvas+fuentes), el equipo la corre | IMPLEMENTED (no VERIFIED) |
| `docs/ocr/training.md` §7 (dataset sintético: cómo, limitaciones, brecha sintético→real) | `docs/ocr/training.md` | — | VERIFIED (documentación) |

### Límite de sesión (crítico, no un límite del código): sin dataset/modelo/métricas reales de esta fase

Renderizar texto con fuentes reales (`ctx.font`+`fillText`) requiere un Canvas 2D de
navegador real, que no existe en esta sesión (jsdom no lo implementa, sin paquete
`canvas` de Node instalado — mismo límite ya documentado para `decodeImage` en Fase 4a).
Por lo tanto, **ninguna cifra concreta pedida en el cierre de esta fase fue producida
por esta sesión**: no hay dataset sintético real generado, no hay modelo entrenado real,
no hay accuracy/precision/recall/matriz de confusión reales, no hay tiempo de
entrenamiento ni tamaño de modelo serializado medidos. Lo que sí está verificado por
unit test: las fórmulas de distorsión (a mano), la orquestación de síntesis (con un
renderer falso inyectado, no canvas real), y el entrenamiento/evaluación/serialización
del modelo (que no dependen de canvas — solo de descriptores HOG ya calculados sobre
`ImageData` sintética construida directamente en los tests, sin pasar por fuentes
reales). El equipo debe correr `/ocr-lab/train` en su navegador para obtener las cifras
reales y reportarlas.

### Desviación del prompt: sin bucket de Storage `ocr-models`

Se pidió guardar el modelo en un bucket de Supabase Storage
(`ocr-models/model-knn.json`). Ese bucket no existe (solo `documents`) y crearlo
requeriría una migración + políticas RLS nuevas — cambio de infraestructura fuera de lo
que corresponde decidir unilateralmente en esta fase. Se reutiliza `ocr_models.model_data`
(jsonb), ya existente y ya usado para esto en Fase 4c (`trainAndEvaluateModel`). Ver
razón completa en `model-persistence.ts`.

## Entregables técnicos de Fase 4e

| Entregable | Archivo(s) | Prueba | Estado |
|---|---|---|---|
| `runOCRPipeline`/`runOCRPipelineOnImageData` (pipeline 4a→4d encadenado, reconstrucción de texto con orden de lectura explícito, timing real por etapa) | `src/modules/ocr/pipeline/ocr-pipeline.ts` | `tests/unit/modules/ocr/pipeline/ocr-pipeline.test.ts` (5/5, incluye timing real medido) | VERIFIED |
| `extractFields` (6 campos: proveedor/nit/fecha/iva/valor/total, regex+keywords, 3 niveles de confidence) | `src/modules/ocr/classification/field-extraction.ts` | `tests/unit/modules/ocr/classification/field-extraction.test.ts` (9/9) | VERIFIED |
| `GET /api/ocr/active-model` (puente RLS: sirve el modelo activo a cualquier usuario autenticado, no solo ADMIN) | `src/app/api/ocr/active-model/route.ts` | `npm run build` sin errores; **sin verificación end-to-end real** — requiere navegador (el equipo la corre) | IMPLEMENTED (no VERIFIED) |
| `saveOcrResult`/`markOcrStarted`/`markOcrFailed` (Server Actions, persisten en `ocr_results`, actualizan `documents.status`, auditan `OCR_STARTED`/`OCR_COMPLETED`/`OCR_FAILED`) | `src/modules/documents/document-processing.ts` | `npm run build` sin errores; **sin verificación contra Supabase real** | IMPLEMENTED (no VERIFIED) |
| `activateModel` (hueco encontrado al cablear esta fase: ni Fase 4c ni 4d activan el modelo que entrenan — sin esto, `/api/ocr/active-model` siempre daría 404) + botón "Activar" en `/ocr-lab/train` (ambas secciones) | `src/modules/ocr/classification/training-actions.ts`, `src/app/(dashboard)/ocr-lab/train/{ocr-train-client,synthetic-training-panel}.tsx` | `npm run build` sin errores; **sin verificación contra Supabase real** | IMPLEMENTED (no VERIFIED) |
| UI: botón "Procesar documento" + tabla de campos extraídos + texto OCR crudo colapsable en `/documents/[id]` | `src/app/(dashboard)/documents/[id]/{page,process-document-client}.tsx` | `npm run build` sin errores; **sin verificación visual** — prohibido en esta sesión (`CLAUDE.md` §11) | IMPLEMENTED (no VERIFIED) |
| Corrección consecuente: `queries.ts` (RF-005, Fase 2) usaba `monto_total`, ahora `total` | `src/modules/documents/queries.ts` | `tests/integration/document-filters.test.ts` (7/7, **corrido contra Supabase real en esta sesión**) | VERIFIED |
| `docs/ocr/extraction.md` (heurística, confidence, benchmark real, limitaciones) | `docs/ocr/extraction.md` | ejemplos tomados directo de los tests arriba | VERIFIED |

### Decisiones técnicas / desviaciones de esta fase

1. **Arquitectura cliente/servidor no anticipada por el prompt**: `decodeImage` (Fase
   4a) requiere `createImageBitmap`/`<canvas>`, inexistentes en el runtime de una
   Server Action (Node.js) — el pipeline OCR completo **tiene que correr en el
   navegador**, no server-side como sugería el pseudocódigo original de
   `document-processing.ts`. Se separó en: pipeline+extracción (cliente, puro) →
   Server Actions que solo persisten el resultado ya calculado (mismo patrón que
   `saveLabeledSamples`/`saveSyntheticModel` de Fase 4c/4d).
2. **Puente de RLS para el modelo activo**: `ocr_models` es RLS solo-ADMIN, pero un
   usuario regular necesita el modelo para procesar su propio documento. Se creó
   `GET /api/ocr/active-model`, que exige sesión autenticada y usa el cliente
   `service_role` para esa lectura puntual — no se tocó la RLS de `ocr_models` en sí.
3. **Bug real corregido en el diseño de confidence de extracción**: la ventana de
   contexto simétrica (±50 caracteres) propuesta en el prompt colapsa cuando varios
   campos monetarios están cerca en el texto (exactamente el caso de una factura) —
   ver detalle y fix (proximidad dirigida keyword→valor) en `docs/ocr/extraction.md` §3.
4. **Bug real corregido en el ejemplo de keywords**: buscar `Total` por substring
   encuentra también la `total` dentro de `Subtotal` — se corrigió con límite de
   palabra (`\bTotal\b`), verificado con un test dedicado.
5. **`monto_total` → `total`**: cambio consecuente de RF-003, propagado a
   `queries.ts` (RF-005) y verificado contra Supabase real, no solo en código nuevo.
6. **Heurística Total/Valor/IVA por relación numérica**: no implementada — ver
   `docs/ocr/extraction.md` §4.

### Benchmark real (no estimado) — ver detalle en `docs/ocr/extraction.md` §6

Factura sintética ~25 líneas / ~1184 caracteres, kNN a escala de Fase 4d (9920
muestras): preprocess 43.7ms + segmentación 88.5ms + reconocimiento 4715.7ms +
extracción 1.0ms = **4849.2ms total**. Dentro de <5s pero con margen mínimo — ver
RNF-001 arriba para el análisis de riesgo.

### Qué debe revisar el equipo (pedido explícito de esta fase)

Con 2-3 facturas reales de Mansor, procesarlas en `/documents/[id]` y reportar:

- Qué % de cada campo (proveedor/NIT/fecha/IVA/valor/total) se extrajo correctamente.
- Si el `processing_ms` real en un dispositivo móvil se mantiene bajo 5s (el benchmark
  de esta sesión es de una máquina de desarrollo, no representativo de RNF-004).
- Si el modelo activo (`ocr_models`) existe — sin uno, `/api/ocr/active-model`
  devuelve 404 y el botón "Procesar documento" falla con ese mensaje; hace falta que
  alguien entrene y **active** un modelo (Fase 4c/4d ya construyeron el entrenamiento,
  pero ningún modelo se activa automáticamente — es una decisión explícita, todavía
  pendiente).
