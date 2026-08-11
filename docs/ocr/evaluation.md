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
| Field accuracy | % de documentos donde un campo dado (`proveedor`, `fecha`, `monto_total`, `numero_factura`) coincide exactamente (o según regla de tolerancia definida, p. ej. normalización de formato de fecha) con el valor real |
| Precisión por campo obligatorio | Field accuracy desglosada individualmente para `proveedor`, `fecha`, `monto_total` |
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
2. >70% de precisión en campos obligatorios (`proveedor`, `fecha`, `monto_total`) sobre
   `test`.
3. >80% de precisión en campos obligatorios sobre `test`.
4. Objetivo final: ≥85% de precisión en campos obligatorios sobre `test`.

Cada hito se reporta únicamente cuando esté efectivamente medido, con la fecha, versión
del modelo y tamaño del conjunto `test` usado.

## 5. Estado actual

Sin mediciones — no existe pipeline implementado todavía (Fase 0). Esta sección se
completa progresivamente a partir de la Fase 4f.
