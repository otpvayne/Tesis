# Evaluación del motor OCR

## 1. Principio rector

Ninguna cifra de precisión o tiempo en este documento es válida hasta medirse
experimentalmente sobre la partición `test` (nunca `train`/`validation`) con un modelo
y una versión de código identificables. Cualquier cifra histórica de referencia citada
en el enunciado del proyecto (ej. 89%, 3.8s) es solo una referencia externa, nunca un
resultado propio hasta comprobarse de nuevo con nuestro pipeline.

## 2. Métricas

| Métrica | Definición |
|---|---|
| Character accuracy | % de caracteres reconocidos correctamente sobre el total de caracteres reales en `test` (distancia de edición carácter a carácter contra el ground truth etiquetado en OCR LAB) |
| Word accuracy | % de palabras reconocidas exactamente iguales al ground truth |
| Field accuracy | % de documentos donde un campo dado (`proveedor`, `nit`, `fecha`, `iva`, `valor`, `total` — RF-003 actualizado en Fase 4e con datos reales de Mansor, facturación colombiana) coincide exactamente (o según regla de tolerancia definida, p. ej. normalización de formato de fecha, epsilon numérico para montos) con el valor real |
| Precisión por campo obligatorio | Field accuracy desglosada individualmente para los 6 campos de RF-003 |
| Tiempo de procesamiento | `processing_ms` medido real por documento (RNF-001), reportado como promedio y percentiles (p50/p95) sobre `test` |
| % documentos procesables | % de documentos de `test` que el pipeline logra procesar de inicio a fin sin fallo (`OCR_FAILED`) |
| Confidence promedio | Promedio del confidence score (§9 de `docs/ocr/algorithms.md`) sobre los documentos de `test`, para contrastar contra accuracy real y verificar que el score es informativo |

## 3. Protocolo

1. El modelo a evaluar se identifica por `document_type` + `version` (ej.
   `invoice_es_v1`), registrado en `ocr_models`.
2. Se ejecuta el pipeline completo sobre cada documento de `test` (nunca visto en
   `train`/`validation` para ese modelo).
3. Se compara la salida contra el ground truth etiquetado en OCR LAB.
4. Se agregan las métricas de la tabla anterior y se registran junto con la versión del
   modelo y la fecha de evaluación.
5. Nunca se reporta como resultado de evaluación una imagen que formó parte de `train`
   o `validation` de ese modelo.

## 4. Objetivos progresivos

Estos son objetivos de proceso, no afirmaciones de resultado actual:

1. Pipeline completo funcional de extremo a extremo (aunque la precisión sea baja).
2. >70% de precisión en campos obligatorios (`proveedor`, `nit`, `fecha`, `iva`,
   `valor`, `total`) sobre `test`.
3. >80% de precisión en campos obligatorios sobre `test`.
4. Objetivo final: ≥85% de precisión en campos obligatorios sobre `test`.

Cada hito se reporta únicamente cuando esté efectivamente medido, con la fecha, versión
del modelo y tamaño del conjunto `test` usado.

## 5. Infraestructura de evaluación (Fase 4f, implementada)

`src/modules/ocr/evaluation/`:

- `character-metrics.ts` — `evaluateCharacterRecognition`/`computeCharacterMetrics`:
  accuracy, accuracy por clase, matriz de confusión (dinámica según labels vistas, no
  62×62 fijo), top-10 confusiones más frecuentes. Dos entradas posibles: `ImageData`
  (datos sintéticos/tests) o pares `{expected, predicted}` ya calculados — esto último
  porque `ocr_training_samples.feature_data` guarda el **descriptor HOG ya extraído**,
  no la imagen cruda, así que evaluar contra la partición `test` real predice
  directamente con `KNNClassifier.predict(descriptor)`, no reconstruyendo una imagen
  que no se puede reconstruir desde su descriptor.
- `field-extraction-metrics.ts` — `evaluateFieldExtraction`/`computeFieldMetrics`:
  accuracy/precision/recall/F1 por campo (TP=coincide, FP=extraído pero incorrecto,
  FN=no extraído), tolerancia numérica (`epsilon=0.005`) para montos.
- `performance-benchmark.ts` — `benchmarkPerformanceOnImageData`/`computeBenchmarkFromTimings`:
  promedio, P95/P99 (nearest-rank), throughput, cuello de botella real (no asumido).
- `reproducibility-test.ts` — `testReproducibility`: corre la misma imagen N veces,
  compara texto/campos exactos, varianza de confidence y de valores numéricos.
- `generate-report.ts` — `generateEvaluationReport`: formatea las 4 métricas de arriba
  a texto. No calcula nada — solo presenta lo que se le pasa, con `datasetLabel`
  obligatorio para que nunca quede ambiguo si un reporte es de datos sintéticos o
  reales.
- **Evaluación real contra el modelo activo**: `evaluateActiveModelOnTestPartition`
  (`modules/ocr/classification/training-actions.ts`) + sección "Evaluación del modelo
  activo" en `/ocr-lab/train` — corre contra la partición `test` **real** de
  `ocr_training_samples`. Lanza un error explícito (no una métrica falsa sobre 0 casos)
  si no hay modelo activo o si `test` está vacío.

**Corrección de inconsistencia encontrada al construir esto:** `trainAndEvaluateModel`
(Fase 4c) y `saveSyntheticModel` (Fase 4d) guardaban `ocr_models.model_data` con **dos
formas distintas** (`{descriptors, labels}` armado a mano vs. `KNNClassifier.toJSON()` —
`{samples: [...]}`). Se unificaron ambas a `KNNClassifier.toJSON()`, la única forma que
`evaluateActiveModelOnTestPartition` sabe leer.

## 6. Estado actual

**Primera medición real contra `test` (2026-09-07):** `trainAndEvaluateModel` sobre
10,662 muestras de `train` (todas reales, etiquetadas en OCR LAB por Andrés y
Santiago), evaluado contra 2,427 muestras reales de `test` de facturas de Mansor:

```
Character accuracy: 67.4% (character-metrics.ts, sobre descriptores HOG
                    ya extraídos de ocr_training_samples.feature_data,
                    no ImageData reconstruida — ver nota de §5 sobre por
                    qué la evaluación real trabaja con descriptores)
Clases evaluadas:   62
Modelo:             reentrenado y activado el 2026-09-07 (ocr_models,
                    reemplaza al sintético de Fase 5, 16.1%)
```

Esto es **character accuracy únicamente** — el % de campos completos correctos
(field accuracy, RF-003, los objetivos progresivos de §4) todavía no se ha medido
contra facturas reales validadas en `/documents/[id]`; no asumir que 67.4% de
caracteres se traduce en 67.4% de campos (un solo carácter mal en un NIT ya invalida
el campo). Pendiente: correr esa medición aparte y completar esta sección con field
accuracy real, matriz de confusión (vía "Evaluar modelo activo sobre 'test'" en
`/ocr-lab/train`) y accuracy por clase — las clases poco frecuentes en facturas en
español (`K`, `Q`, `X`, `Z`, `q`, `w`, `x`, `z`, etc., ver `README.md` "⏳ Pendientes")
siguen con pocas muestras y probablemente concentran buena parte del 32.6% de error.

**Corrida de validación con datos sintéticos (Fase 4f, esta sesión)** — no representa
precisión sobre facturas reales, solo confirma que la aritmética de las 4 herramientas
de evaluación es correcta, usando un alfabeto sintético de 2 formas conocidas (barra
gruesa='1', diagonal gruesa='7') entrenado y evaluado con `ImageData` construida
directamente (sin canvas de navegador, sí testeable en esta sesión — a diferencia de
`dataset-synthesizer.ts` de Fase 4d):

```
Character Recognition: 88.2% (15/17) — confusión '7'→'1': 2 veces
Field Extraction:      0.0% — alfabeto de 2 formas no alcanza a deletrear
                        keywords reales ("NIT", "Total", etc.), resultado
                        esperado y honesto, no un fallo del código
Performance:            7.4ms promedio (facturas sintéticas triviales de
                        3 caracteres — NO comparable con el benchmark
                        representativo de Fase 4e, ~1184 caracteres,
                        4849.2ms total, ver docs/ocr/extraction.md §6)
Reproducibility:        100.0% (varianza = 0 exacta en las 4 corridas)
```

El accuracy de "Field Extraction" en 0% ilustra exactamente por qué `datasetLabel` es
obligatorio en `generateEvaluationReport`: sin esa etiqueta, un 0% podría leerse como
"el sistema falla", cuando en realidad es "el test no le dio al sistema texto que
pudiera reconocer" — una limitación del test sintético, no del `field-extraction.ts`
de Fase 4e (ya verificado a fondo con `OCRResult` construido directo,
`field-extraction.test.ts`, 9/9).
