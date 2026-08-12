# Dataset y entrenamiento

## 1. Principio rector

No se inventan datos de entrenamiento, resultados ni métricas en ningún documento del
proyecto. Toda muestra de entrenamiento proviene de imágenes reales (facturas propias
del equipo/Mansor, anonimizadas donde corresponda, o facturas de ejemplo creadas para
este fin) procesadas y etiquetadas a través de la herramienta **OCR LAB**.

Ya existen un par de facturas reales de Mansor disponibles para este propósito; no se
usan todavía en Fase 0. Se irán consiguiendo más conforme avance el desarrollo. Ninguna
factura real de Mansor se sube al repositorio Git (ver `CLAUDE.md` §11 y
`.gitignore`).

**Desviación explícita de este principio (Fase 4d):** el prompt de Fase 4d pidió
generar un dataset **sintético** (caracteres renderizados con fuentes del sistema +
distorsiones geométricas/ruido, no imágenes reales ni procesadas por OCR LAB) para
tener un modelo funcional mientras se recolecta el dataset real en paralelo. Esto no
inventa métricas ni resultados (§9 sigue aplicando: ninguna cifra de este documento es
válida hasta medirse) — es una fuente de datos de entrenamiento distinta de la prevista
originalmente aquí. Se documenta como excepción explícita, no como cambio silencioso del
principio: el dataset sintético es un **pretrain**, nunca el dataset de evaluación final
(`test` sigue siendo exclusivamente de facturas/etiquetado real, ver §7 más abajo). Ver
detalle completo en §7.

## 2. OCR LAB

Herramienta interna, accesible solo para rol `ADMIN`, para construir el dataset y (en
fases posteriores) entrenar/versionar modelos. Funciones mínimas:

1. Cargar imágenes de entrenamiento (subida manual, no captura de cámara de producción).
2. Seleccionar el tipo documental (`invoice_es` por ahora).
3. Ejecutar las etapas de segmentación del pipeline sobre la imagen cargada.
4. Mostrar los caracteres/regiones segmentados resultantes.
5. Etiquetar manualmente cada carácter/región (y corregir etiquetas erróneas).
6. Guardar la muestra etiquetada (`ocr_training_samples`) con metadata: tipo documental,
   imagen de origen, `label`, dimensiones, configuración de segmentación usada, fecha,
   partición (`train`/`validation`/`test`).
7. Marcar explícitamente la partición de cada muestra al guardarla.

OCR LAB (etiquetado + entrenamiento, `/ocr-lab/train`) se implementó en **Fase 4c**
(adelantado desde el plan original de Fase 4d — ver desviación de roadmap documentada
en `CLAUDE.md` §13), sobre el pipeline de segmentación ya construido en `4a`/`4b`.
Fase 4d le agregó la sección de dataset sintético (§7) en la misma página.

## 3. Particiones

- **`train`**: usada exclusivamente para ajustar el modelo (para kNN, es literalmente el
  conjunto de referencia contra el que se calcula distancia).
- **`validation`**: usada para calibrar hiperparámetros (`k`, tamaño de celda HOG,
  parámetros de Otsu/morfología, `α`/`β` de confidence) y decidir si una etapa del
  pipeline aporta valor.
- **`test`**: **jamás** se usa para entrenar ni para calibrar hiperparámetros. Solo se
  usa para reportar métricas finales (`docs/ocr/evaluation.md`). Si una imagen se usó en
  `train`/`validation`, no puede reaparecer en `test`.

La partición se decide y registra al momento de guardar la muestra en OCR LAB, no
después. Un mismo documento de origen (misma factura física) no debe tener recortes en
más de una partición, para evitar fuga de información (data leakage) entre particiones.

## 4. Tamaño y alcance del dataset inicial

No se fija un tamaño objetivo definitivo en Fase 0 — depende de cuántas facturas reales
consiga el equipo y de cuántas muestras artificiales/sintéticas se generen para cubrir
el alfabeto inicial (`0-9`, `A-Z`, `a-z`). Se documentará el tamaño real alcanzado y su
distribución por partición en `docs/ocr/evaluation.md` cuando exista.

## 5. Confidencialidad

- Ninguna factura real de Mansor se sube al repositorio Git, ni completa ni recortada,
  ni sus metadatos si permiten identificar al proveedor/cliente.
- El repositorio puede incluir: datasets sintéticos pequeños sin información privada,
  fixtures para unit tests (matrices pequeñas con resultado calculable a mano), scripts
  de entrenamiento/evaluación, y metadata anonimizada (IDs, no nombres reales).
- Los datasets reales viven fuera del repo (ver `.gitignore`: `data/real/`,
  `data/private/`, `datasets/real/`, `**/facturas-reales/`). Su forma de obtención y
  ubicación local se documenta aquí una vez exista un flujo real (Fase 4d), sin exponer
  contenido sensible en el documento.

## 6. Versionado de modelos

Cada modelo entrenado se guarda en `ocr_models` con `document_type`, `version` (ej.
`invoice_es_v1`), sus métricas de evaluación (`metrics`, sobre `test`) y un flag
`active`. Solo un modelo activo por tipo documental. Reentrenar no sobrescribe el
modelo anterior — se crea una versión nueva y se activa explícitamente
(`MODEL_TRAINED` / `MODEL_ACTIVATED` en `audit_logs`).

Los modelos entrenados con dataset sintético (§7) usan el mismo mecanismo
(`ocr_models.model_data`, no un bucket de Storage separado — ver razón en
`model-persistence.ts`), con `version` prefijada `synthetic-` para distinguirlos a
simple vista de un modelo entrenado con dataset real etiquetado.

## 7. Dataset sintético (Fase 4d, pretrain)

### 7.1 Por qué

Generar ~10,000 caracteres sintéticos (fuentes del sistema + rotación/escala/skew/ruido)
da un modelo kNN funcional de inmediato, sin esperar a que el equipo termine de
etiquetar facturas reales en paralelo. Es una técnica común en OCR (pre-entrenar
sintético, luego fine-tune con datos reales) — el modelo sintético **no reemplaza** el
dataset real, es un punto de partida razonable mientras ese dataset crece.

### 7.2 Cómo se genera

`modules/ocr/classification/`:

- `distortions.ts`: rotación (matriz de rotación, mapeo inverso), escala (mapeo inverso
  alrededor del centro), skew (shear afín), ruido sal-y-pimienta (probabilidad por
  píxel) — funciones puras sobre `ImageData`, sin dependencia de canvas real, con tests
  unitarios verificados a mano (incluye una rotación de 90° verificada exactamente
  contra la matriz de rotación).
- `dataset-synthesizer.ts`: `renderCharacterGlyph` (Canvas 2D + `fillText`, **solo
  funciona en un navegador real** — ver limitación en §7.4) → `rotateImage` →
  `scaleImage` → `skewImage` → `applySaltPepperNoise` → **el mismo binarizado +
  corrección de polaridad + recorte/recentrado que procesa documentos reales**
  (`otsuBinarization`, `ensureTextIsForeground`, `normalizeCharacter` — Fase 4a/4b, no
  reimplementado). `synthesizeDataset` acepta un `renderer` inyectable, así que su
  orquestación (conteos, distribución de labels, dimensiones) sí tiene test unitario sin
  necesitar canvas real.
- `model-trainer.ts`: `trainModel(dataset, k, trainTestSplit)` — split **estratificado
  por label** (`Dataset.split`, Fase 4c), entrena `CharacterClassifier` (HOG+kNN),
  evalúa contra el conjunto de test separado, calcula accuracy/precision/recall/matriz
  de confusión, y marca `generalizationWarning` si el accuracy cae bajo
  `OCR_TRAINING_CONFIG.MIN_ACCURACY_THRESHOLD`.
- `model-persistence.ts`: `serializeModel`/`deserializeModel` — round-trip JSON del
  `CharacterClassifier` (que en el fondo es el conjunto de muestras del kNN, no hay
  pesos que ajustar).

Parámetros centralizados en `OCR_TRAINING_CONFIG` (`modules/ocr/config.ts`) —
`SYNTHETIC_SAMPLES_PER_CHARACTER`, `SYNTHETIC_FONTS`,
`DISTORTION_{ROTATION,SCALE,NOISE,SKEW}_RANGE`, `TRAIN_TEST_SPLIT`, `KNN_K` (referencia
a `OCR_CONFIG.KNN_K`, no duplicado), `MIN_ACCURACY_THRESHOLD`. Ninguno es un valor
medido — puntos de partida documentados, a recalibrar con datos reales.

### 7.3 UI: `/ocr-lab/train`

Sección "Dataset sintético" (bajo el etiquetado manual, misma página, gateada a
`ADMIN`): elegir caracteres + muestras por carácter, "Generar dataset y entrenar"
(corre síntesis + entrenamiento en el navegador), muestra accuracy/tiempo de
entrenamiento/matriz de confusión (heatmap simple, verde=diagonal/correcto,
rojo=fuera de diagonal/error), "Guardar modelo" (→ `ocr_models`, vía
`saveSyntheticModel`, inactivo por defecto) y "Descargar modelo" (JSON, para inspección
local).

### 7.4 Limitación de sesión (importante, no un límite del código)

Renderizar texto con fuentes reales (`ctx.font` + `fillText`) requiere un **Canvas 2D
de navegador real** — no existe en el entorno donde se escribió y probó este código
(mismo límite ya documentado para `decodeImage`, Fase 4a: jsdom no implementa un
contexto 2D real, y no hay paquete `canvas` de Node instalado). Esto significa que
**ninguna cifra concreta de este documento** (tamaño de dataset generado, accuracy,
precision/recall, matriz de confusión, tiempo de entrenamiento, tamaño del modelo
serializado) fue producida por la sesión que escribió el código — se generan cuando el
equipo corre `/ocr-lab/train` en su propio navegador. Lo que sí está verificado por
unit test en esa sesión: las fórmulas de distorsión (a mano), la orquestación de
`synthesizeDataset` (con un renderer inyectado, no canvas real), y todo
`model-trainer.ts`/`model-persistence.ts` (no dependen de canvas, solo de descriptores
HOG ya calculados).

### 7.5 Limitaciones conocidas del enfoque (no bugs)

1. **Solo texto impreso, no manuscrito** — las fuentes del sistema no producen
   variación de escritura a mano; un modelo entrenado solo con esto puede fallar en
   cualquier trazo manuscrito.
2. **Caracteres muy pequeños** (`<10px`, bajo `CHAR_MIN_HEIGHT`) no forman parte del
   dataset sintético (se generan a `CHAR_SIZE=32` fijo) — no cubre esa degradación.
3. **Caracteres visualmente similares** (`1`/`l`, `0`/`O`, `S`/`5`) pueden tener
   precision/recall baja incluso en el dataset sintético, ya que HOG captura forma de
   trazo — dos formas casi idénticas producen descriptores casi idénticos. Es una
   limitación de HOG+kNN sobre formas ambiguas, no del proceso de síntesis.
4. **Brecha sintético→real**: tipografías limpias con distorsión controlada no capturan
   ruido de sensor de cámara real, iluminación despareja, ni artefactos de compresión
   JPEG de una foto real de factura — de ahí que el dataset real (fine-tuning, Fase
   4e+) sea necesario, no opcional.
