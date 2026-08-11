# Pipeline OCR — diseño

**Regla no negociable:** todo el pipeline se implementa desde cero por el equipo. Ver
`CLAUDE.md` §7 para la lista de dependencias prohibidas y permitidas. Este documento
describe el diseño; la implementación ocurre progresivamente en las fases `4a`–`4f`.

## 1. Etapas

```
Imagen (File/Blob, JPG|PNG)
  → decodificación nativa (createImageBitmap / <img> + Canvas)
  → RGB → escala de grises
  → normalización
  → ajuste de contraste
  → histograma
  → binarización (Otsu propio)
  → reducción de ruido
  → operaciones morfológicas propias
  → componentes conectados propios
  → proyecciones horizontales/verticales
  → segmentación de líneas → palabras → caracteres
  → normalización de cada carácter (tamaño/posición fijos para HOG)
  → extracción de características (HOG propio)
  → clasificación (kNN propio)
  → reconstrucción de palabras/líneas
  → postprocesamiento (correcciones léxicas simples, sin diccionario externo pesado)
  → extracción de campos (perfil invoice_es)
  → cálculo de confianza (por carácter, por campo, global)
```

No es obligatorio implementar cada etapa en su forma "completa" de manual de libro de
texto si una prueba experimental demuestra que no aporta valor medible para
`invoice_es` — cualquier omisión o simplificación se documenta aquí con la evidencia
que la sustenta (comparación con/sin la etapa sobre el mismo conjunto de validación).

## 2. Ejecución fuera del hilo principal

Todo el pipeline (desde binarización en adelante, que es lo computacionalmente pesado)
corre en `workers/ocr.worker.ts` (Web Worker). `modules/ocr` contiene la lógica pura
(funciones que reciben `ImageData`/`TypedArray` y devuelven resultados), y el worker
solo orquesta llamadas y reporta progreso — así la lógica es testeable de forma aislada
sin necesitar un Worker real en los unit tests.

Estados de progreso reportados a la UI (RF/RNF-008, sección 19 del enunciado):

1. Preparando imagen
2. Segmentando
3. Reconociendo caracteres
4. Extrayendo campos
5. Finalizando

Cada transición se dispara cuando la etapa correspondiente realmente comienza/termina —
nunca se simula con temporizadores fijos.

## 3. Perfiles de documento

```ts
interface OCRDocumentProfile {
  id: string;                 // "invoice_es"
  name: string;
  preprocessingConfig: PreprocessingConfig;
  segmentationConfig: SegmentationConfig;
  characterSet: string[];     // alfabeto soportado por el perfil
  fieldExtractor: FieldExtractor; // implementación específica del perfil
  modelVersion: string;       // "invoice_es_v1"
}
```

Único perfil desarrollado en este proyecto: **`invoice_es`** (facturas impresas en
español). Perfiles futuros mencionados en el enunciado (tipos documentales 2, 3 y 4) no
están definidos — se referencian únicamente como `future_document_type_2`,
`future_document_type_3`, `future_document_type_4` cuando sea necesario nombrarlos en
documentación, sin inventar campos ni reglas de negocio para ellos.

## 4. Cálculo de confianza — visión general

El detalle matemático está en `docs/ocr/algorithms.md`. Principio general: la confianza
nunca es un número arbitrario; se deriva de señales reales disponibles en cada etapa
(distancia del clasificador kNN, consistencia de voto entre vecinos, calidad de
segmentación del carácter, coherencia del patrón esperado del campo — p. ej. una fecha
debe matchear un patrón de fecha — y agregación a nivel de campo y documento).

## 5. Alcance de caracteres

Prioridad 1: `0-9`, `A-Z`, `a-z`. Evaluados después de tener el pipeline base
funcionando y medido: acentos (`á é í ó ú Á É Í Ó Ú ñ Ñ`) y signos
(`. , : / # $ % ( )`), típicos de facturas en español (fechas, montos, unidades). No se
amplía el alfabeto sin medir que la necesidad es real (ej. tasa de fallo por carácter no
soportado en el dataset de validación).
