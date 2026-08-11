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

OCR LAB se implementa en Fase 4d, sobre el pipeline de segmentación ya construido en
`4a`/`4b`.

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
