# Extracción de campos (RF-003) — Fase 4e

## 1. Alcance y contexto

RF-003 se actualizó en esta fase con datos reales de Mansor (facturación colombiana),
reemplazando la definición de Fase 0 (`proveedor`, `fecha`, `monto_total` +
`numero_factura` deseado). Campos obligatorios actuales:

**Proveedor, NIT, Fecha, IVA, Valor, Total.**

`numero_factura` salió del alcance obligatorio (no se pidió en la actualización).
`monto_total` pasó a llamarse `total` — esto tuvo un efecto real en código ya
existente: `src/modules/documents/queries.ts` (RF-005, Fase 2) filtraba documentos por
`extracted_data->monto_total->>value`; se actualizó a `extracted_data->total->>value`
(verificado contra Supabase real, `tests/integration/document-filters.test.ts`, 7/7).

Implementación: `src/modules/ocr/classification/field-extraction.ts`. Heurística pura
(regex + keywords), **no ML** — `CLAUDE.md` §7 prohíbe ML/CV de terceros para
*reconocer caracteres*; esto opera sobre texto ya reconocido por el pipeline propio
(HOG+kNN, Fase 4c/4d), es una etapa distinta.

## 2. Patrones y keywords por campo

| Campo | Patrón | Keywords | Tipo de valor |
|---|---|---|---|
| `nit` | `\d{1,3}\.\d{3}\.\d{3}-\d{1}` (formato punteado) o `\d{9,11}` (dígitos seguidos) | `NIT`, `N.I.T` | `string` |
| `fecha` | `\d{4}-\d{2}-\d{2}` o `\d{1,2}[/-]\d{1,2}[/-]\d{4}` | `Fecha`, `Emisión`, `Emision`, `Date` | `string` (tal cual, sin normalizar formato) |
| `iva` | `\d+[.,]\d{2}` | `IVA`, `Impuesto` | `number` |
| `valor` | `\d+[.,]\d{2}` | `Valor`, `Subtotal` | `number` |
| `total` | `\d+[.,]\d{2}` | `Total` | `number` |
| `proveedor` | — (sin regex, es un nombre) | `Proveedor`, `Emisor`, `Razón Social`, `Señor` | `string` |

Todas las búsquedas de keyword usan límite de palabra (`\bTotal\b`), no substring —
sin eso, buscar `Total` encontraría también la `total` dentro de `Subtotal`, mezclando
los campos `valor` y `total`. Verificado explícitamente en
`field-extraction.test.ts` ("no confunde 'Total' con la 'total' dentro de 'Subtotal'").

## 3. Cálculo de confidence — 3 niveles, no una ventana de contexto simétrica

El diseño original propuesto en el prompt de esta fase buscaba, para cada número
candidato, si alguna keyword del campo aparecía en una ventana de contexto simétrica
(`texto[i-50, i+50]`). **Se verificó que ese diseño tiene un bug real** con varios
campos monetarios en un bloque de texto corto (exactamente el caso de una factura:
"IVA 234.56\nValor 1234.56\nTotal 1468.12" cabe entera en una ventana de ±50 caracteres)
— la keyword de un campo también cae dentro de la ventana de los *otros* números, y el
criterio de desempate (`if (confidence > best.confidence)`, estricto) no reemplaza en
empates, así que los tres campos habrían devuelto el mismo primer número en vez de sus
propios valores.

Se implementó en su lugar un esquema de **proximidad dirigida** (candidato
inmediatamente *después* de la keyword, no "en algún lugar cerca"), con 3 niveles:

1. **`0.95`** — el candidato está a ≤15 caracteres después de una keyword del campo
   (cubre separadores típicos: `: `, `. `, espacios). Ej: `"IVA 234.56"`,
   `"Total: 1468.12"`.
2. **`0.7`** — la keyword aparece en el texto, pero ningún candidato está pegado a
   ella; se toma el candidato numéricamente más cercano (por posición en el texto) a
   cualquier aparición de la keyword. Señal real pero ambigua.
3. **`0.5`** — la keyword no aparece en absoluto; se toma el primer candidato que
   matchea el patrón en todo el texto, como conjetura de último recurso.
4. **Sin match** (`value: null, confidence: 0`) — el patrón no aparece en ningún
   lugar del texto. Nunca se inventa un valor.

`proveedor` usa una lógica distinta (no tiene patrón): keyword seguida del resto de
esa misma línea (`confidence 0.9`); si ninguna keyword aparece, la primera línea
reconocida con al menos 3 letras seguidas, como conjetura (`confidence 0.5`).

`sourceRegion` reporta la posición a **nivel de línea** (bbox de la `OCRLine` donde
cayó el match), no de carácter individual — `OCRResult` (`ocr-pipeline.ts`) no lleva
bounding box por carácter, solo por línea reconstruida.

## 4. Heurística Total/Valor/IVA no implementada (limitación conocida)

El prompt de esta fase también sugería una heurística de respaldo basada en la
relación numérica `Total > Valor > IVA` para el caso sin ninguna keyword (tres números
sin etiqueta, ordenados por magnitud). **No se implementó** — agrega una rama de
lógica separada (detectar "ninguno de los 3 campos tiene keyword", reunir todos los
candidatos monetarios del texto, ordenarlos, asignar por rango) para un caso extremo
que el propio prompt no incluía en su ejemplo de test, y que además puede fallar en la
práctica (facturas donde el IVA es 0, o donde el subtotal incluye líneas que no sean
`Valor < Total`). Queda documentado como mejora futura, no una omisión oculta.

## 5. Pipeline completo (Fase 4e): dónde corre cada pieza

`decodeImage` (Fase 4a) usa `createImageBitmap` + `<canvas>` — **solo funciona en un
navegador real**, no en una Server Action (Node.js). Esto determina la arquitectura de
todo el pipeline de reconocimiento:

- **`runOCRPipeline`/`runOCRPipelineOnImageData`** (`modules/ocr/pipeline/ocr-pipeline.ts`):
  corre en el navegador del usuario. Encadena preprocesamiento (4a) → segmentación
  (4b) → clasificación (4c/4d, un `CharacterClassifier` ya cargado) → reconstrucción
  de texto (líneas → palabras → caracteres, **ordenados explícitamente por `xStart`**
  — `findConnectedComponents` los descubre en orden de escaneo BFS, que normalmente
  coincide con el orden de lectura pero no lo garantiza).
- **`GET /api/ocr/active-model`**: `ocr_models` tiene RLS solo-ADMIN (gestión del
  modelo es cosa de OCR LAB), pero *usar* el modelo activo para reconocer el propio
  documento es una operación legítima de cualquier usuario autenticado. Este endpoint
  es el puente: exige sesión (401 sin ella), usa el cliente `service_role`
  (`lib/supabase/admin.ts`) para leer el modelo activo saltando esa RLS —
  **de solo lectura, un recurso compartido del sistema, no datos de otro usuario**.
- **`extractFields`** (`field-extraction.ts`): también corre en el navegador
  (recibe el `OCRResult` ya construido ahí), pura, sin dependencia de Supabase.
- **`saveOcrResult`/`markOcrStarted`/`markOcrFailed`** (`modules/documents/document-processing.ts`):
  Server Actions — reciben el resultado ya calculado y lo persisten. La política RLS
  `ocr_results_insert_via_document` ya rechaza el insert si el usuario no es dueño del
  documento (ni admin); no se duplica esa comprobación en la Action.

Mismo patrón ya usado en Fase 4c/4d (`saveLabeledSamples`, `saveSyntheticModel`): el
cliente calcula, el servidor persiste y aplica RLS.

## 6. Benchmark real (medido, no estimado)

A diferencia de Fase 4d (bloqueada por requerir fuentes de navegador reales), el
pipeline de esta fase **sí es completamente testeable** con `ImageData` sintética
construida directamente en los tests — ninguna de sus etapas (más allá de
`decodeImage`, que no se ejercita en el benchmark) depende de canvas real. Medido en
esta sesión, sobre una factura sintética de ~25 líneas / ~1184 caracteres reconocidos,
con un `KNNClassifier` a escala realista de Fase 4d (62 clases × 160 muestras = 9920,
descriptores HOG de 108 dims):

| Etapa | Tiempo medido |
|---|---|
| Preprocesamiento (4a) | 43.7ms |
| Segmentación (4b) | 88.5ms |
| Reconocimiento (4c/4d, ~1184 predicciones kNN) | 4715.7ms |
| Extracción de campos (4e) | 1.0ms |
| **Total** | **4849.2ms** |

**Riesgo real para RNF-001 (<5s):** el total quedó *dentro* del objetivo, pero con muy
poco margen (≈150ms), medido en una máquina de desarrollo — no en el dispositivo móvil
real donde efectivamente correrá (RNF-004: navegador de un celular, probablemente más
lento). El cuello de botella es `KNNClassifier.predict`: escaneo lineal `O(N·D)` sin
estructura espacial, ya señalado como riesgo en el cierre de Fase 4c/4d. Con un dataset
de entrenamiento más grande (más muestras reales etiquetadas, Fase 4d en curso en
paralelo por Andrés/Santiago) el tiempo de reconocimiento **crece**, no se mantiene —
este benchmark es el punto de partida para decidir si Fase 4f necesita optimizar la
búsqueda de vecinos (ej. limitar candidatos, estructura espacial) antes de ese
crecimiento, no una confirmación de que el rendimiento está resuelto.

## 7. Limitaciones conocidas

1. **Formato numérico simple** (`\d+[.,]\d{2}`): no maneja separador de miles
   (`1.234.567,89`, formato colombiano típico) — el regex solo captura el último
   segmento con 2 decimales. Facturas con montos de 7+ cifras dan un valor truncado,
   no un error explícito. Ajustar el patrón cuando se vea el problema en facturas
   reales (Fase 4f/evaluación), no antes — sin datos reales que lo confirmen sería
   complejidad especulativa.
2. **NIT sin puntos ni guion** en formatos no colombianos, o con dígito de
   verificación separado por espacio: el patrón asume exactamente
   `XXX.XXX.XXX-X` o dígitos corridos; otros formatos necesitan un patrón adicional.
3. **Proveedor sin heurística robusta**: a diferencia de los otros 5 campos, no hay un
   patrón estructural — depende de que exista una keyword (`Proveedor:`, `Emisor:`)
   o, en su defecto, de que la primera línea reconocida sea efectivamente el nombre
   del proveedor (falla si el encabezado real es un logo/membrete sin texto, o si la
   primera línea reconocible es otra cosa).
4. **Sin heurística de relación numérica** (Total/Valor/IVA) para el caso sin ninguna
   keyword — ver §4.
5. **Solo facturas en español, formato relativamente estándar** — heredado de
   `CLAUDE.md` §7 (perfil `invoice_es`), no se generaliza a otros idiomas/formatos.

## 8. Cómo ajustar (para Fase 4f / cuando el equipo vea fallos reales)

- **Agregar un patrón nuevo**: extender el regex de un campo (ej. añadir
  `\d{6,15}` a `NIT_PATTERN` para un formato sin puntos) — cada patrón está en una
  constante propia al inicio de `field-extraction.ts`, no repartido.
- **Agregar una keyword**: añadir el string al arreglo `*_KEYWORDS` correspondiente
  (case-insensitive, con límite de palabra automático).
- **Ajustar las confidences**: los 3 niveles (0.95/0.7/0.5) y `ADJACENT_WINDOW` (15
  caracteres) son puntos de partida documentados, no medidos contra facturas reales
  — recalibrar con el conjunto `validation` cuando exista (nunca con `test`), igual
  que el resto de parámetros de `OCR_CONFIG`/`OCR_TRAINING_CONFIG`.
