# Plan de pruebas

**Fase:** 1 — herramientas confirmadas. Diseño de estrategia original de Fase 0 abajo,
con la elección real hecha en Fase 1.

## 0. Herramientas (Fase 1)

- **Test runner (unit/integration): [Vitest](https://vitest.dev) `^4.1`.** Elegido sobre
  Jest por integración nativa con Vite/ESM/TypeScript sin configuración adicional de
  transpilación, arranque más rápido, y compatibilidad directa con el resto del
  toolchain de Next.js 16 (Turbopack) usado en este proyecto. Config en
  `vitest.config.mts`; alias `@/*` espejado desde `tsconfig.json`.
- `@testing-library/react` + `jsdom` instalados desde ya para poder probar componentes
  de UI (formularios de auth, validación) sin esperar a necesitarlos.
- **E2E:** herramienta por definir cuando exista una UI navegable de extremo a extremo
  (a partir de Fase 3) — evaluar Playwright en ese momento, no se instala en Fase 1 sin
  uso real.
- Comandos: `npm run test` (una pasada), `npm run test:watch` (modo watch).

## 1. Categorías

| Categoría | Propósito | Ubicación |
|---|---|---|
| Unit | Funciones puras: algoritmos OCR, utilidades, extractores de campo | `tests/unit/` |
| Integration | Interacción entre módulos y Supabase (RLS, Storage, Server Actions) | `tests/integration/` |
| End-to-end | Flujos completos de usuario en navegador (login → captura → validación) | `tests/e2e/` |
| OCR benchmark | Ejecución del pipeline sobre el dataset `test` y cálculo de métricas | `tests/ocr-benchmark/` |

## 2. Prioridad máxima: unit tests de algoritmos OCR

Con matrices/entradas pequeñas y conocidas donde el resultado esperado se puede calcular
a mano (no depende de un dataset real):

- Conversión a escala de grises (matriz RGB pequeña → valores esperados por la fórmula
  de `docs/ocr/algorithms.md` §1)
- Histograma (conteo esperado por nivel de intensidad sobre una matriz fija)
- Otsu (umbral esperado calculable a mano sobre un histograma bimodal simple)
- Binarización (salida esperada dado un umbral fijo)
- Morfología: erosión/dilatación sobre una matriz binaria pequeña con kernel conocido
- Componentes conectados (número y tamaño de componentes esperado sobre una matriz fija)
- Segmentación (proyecciones y puntos de corte esperados sobre un patrón sintético)
- HOG (vector de características esperado sobre un gradiente sintético simple,
  verificando magnitud/orientación/normalización por separado)
- Cálculo de distancias kNN (valor exacto esperado entre vectores conocidos)
- Clasificación kNN (clase esperada dado un conjunto de entrenamiento sintético pequeño
  y `k` fijo)
- Confidence score (valor esperado dado `agreement`/`proximity` conocidos)
- Extracción de campos (valor y `sourceRegion` esperados sobre texto reconstruido
  sintético con patrones de fecha/moneda conocidos)

Estas pruebas no requieren imágenes reales ni el dataset OCR — se escriben junto con
cada algoritmo, en su misma fase de implementación (`4a`–`4e`).

## 3. Integration tests

- Políticas RLS: un usuario no puede leer/modificar documentos de otro usuario; un
  `ADMIN` sí puede leer todos.
- Validación de tipo MIME y tamaño de archivo rechazando entradas inválidas.
- Persistencia correcta de `ocr_results` y `document_validations` (incluye que
  `original_extracted_data` no se sobrescribe al validar).
- Registro de eventos de auditoría en las acciones que lo requieren.

## 4. End-to-end

Flujos mínimos a cubrir cuando exista UI (Fase 3 en adelante):

- Registro → login → dashboard.
- Nuevo documento → captura/selección de imagen → preview → confirmar → procesamiento
  OCR → validación → guardado.
- Listado con filtros (RF-005).
- Acceso denegado a documento de otro usuario (como `USER`).
- Acceso permitido a todos los documentos como `ADMIN`, con visibilidad de auditoría.

## 5. OCR benchmark

Ejecuta el pipeline sobre la partición `test` del dataset y produce las métricas de
`docs/ocr/evaluation.md`. Se corre manualmente (o vía script) al cerrar cambios
relevantes en el pipeline OCR o el modelo — no necesariamente en cada commit, dado que
puede ser costoso; se documenta la fecha y versión del modelo evaluado.

## 6. Qué NO se prueba con datos reales

Ningún test (unit, integration ni e2e) usa facturas reales de Mansor como fixture en el
repositorio. Fixtures de test son sintéticas o genéricas. Las facturas reales solo se
usan localmente, fuera de Git, para poblar el dataset de entrenamiento/evaluación (ver
`docs/ocr/training.md` §5).
