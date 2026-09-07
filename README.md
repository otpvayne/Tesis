# Mansor — Sistema de Digitalización de Documentos

Proyecto de grado de Ingeniería de Software: digitalización de documentos financieros
físicos (inicialmente facturas de proveedor en español) mediante captura desde
navegador y un motor OCR **desarrollado desde cero por el equipo**, para la empresa
Mansor, en conjunto con NETRIX Corporation.

> Estado actual: **Fase 8 — Deploy final: integración, versionado y documentación (en
> cierre).** Fases 4-7 integradas a `main`. Ver la sección
> ["🏆 Estado final — Fase 8"](#-estado-final--fase-8) más abajo para el resumen
> completo con números reales (no estimados), y `CLAUDE.md` §13 /
> `docs/requirements/traceability.md` para el detalle fase por fase y las
> desviaciones pendientes.

## Equipo

| Nombre | Rol |
|---|---|
| Diego Alejandro Medina Martinez | Ingeniero — UMB |
| Andres Felipe Moreno Beltrán | Ingeniero — UMB |
| Santiago Moralez Orozco | Ingeniero — UMB |

## Alcance (resumen)

Aplicación web (no nativa), mobile first, con captura por cámara del navegador o
selección manual de imagen (JPG/JPEG/PNG). El sistema segmenta y reconoce texto con un
pipeline OCR propio (sin librerías de OCR/CV/ML de terceros — ver `CLAUDE.md` sección
7), extrae Proveedor / NIT / Fecha / IVA / Valor / Total (actualizado en Fase 4e con
datos reales de Mansor, según facturación colombiana) para facturas en español, permite
validación humana de lo detectado y almacena todo en Supabase con aislamiento estricto
por usuario vía Row Level Security.

Fuera de alcance en esta versión: soporte PDF, PWA, modo offline, integración contable
(SIIGO u otra) — ver RF-006 en la matriz de trazabilidad.

## Stack

Versiones realmente instaladas al ejecutar el bootstrap técnico (Fase 1,
2026-08-11):

| Paquete | Versión |
|---|---|
| Node.js | v24.17.0 |
| npm | 11.13.0 |
| Next.js (App Router, Turbopack) | 16.3.0 |
| React / React DOM | 19.2.8 |
| TypeScript (`strict`) | 5.9.3 |
| Tailwind CSS | 4.3.3 |
| ESLint | 9.39.5 |
| Vitest | 4.1.10 |
| @supabase/supabase-js | 2.112.3 |
| @supabase/ssr | 0.12.4 |

- **Supabase** — PostgreSQL 17.6 (proyecto `Tesis`, región `ca-central-1`), Supabase
  Auth nativo (sin proveedores externos), Supabase Storage (bucket privado, se
  configura en Fase 2).
- **Vercel** — despliegue (se configura en Fase 8).

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar con las claves reales del proyecto Supabase
npm run dev                  # http://localhost:3000
npm run lint
npm run test                 # unit + integration (integration requiere .env.local)
npm run test:coverage        # igual, con reporte de cobertura (@vitest/coverage-v8)
npm run build

# E2E/performance/seguridad (Fase 7, no ejecutados en la sesión que los escribió):
npx playwright install chromium
E2E_BASE_URL=http://localhost:3000 npx playwright test   # con npm run dev corriendo
```

El stack local de Supabase (`supabase start`) requiere Docker Desktop, no disponible en
todos los entornos de desarrollo del equipo; por eso Fase 1 desarrolla contra el
proyecto Supabase real de desarrollo (`supabase link`), no contra Postgres local. Las
migraciones viven en `supabase/migrations/` y se aplican con `npx supabase db push
--linked`.

## Documentación

- [`docs/architecture/overview.md`](docs/architecture/overview.md) — arquitectura y
  estructura de carpetas.
- [`docs/architecture/data-model.md`](docs/architecture/data-model.md) — modelo
  relacional.
- [`docs/requirements/traceability.md`](docs/requirements/traceability.md) — matriz de
  trazabilidad RF/RNF.
- [`docs/ocr/pipeline.md`](docs/ocr/pipeline.md),
  [`algorithms.md`](docs/ocr/algorithms.md), [`training.md`](docs/ocr/training.md),
  [`evaluation.md`](docs/ocr/evaluation.md) — diseño del motor OCR propio.
- [`docs/testing/test-plan.md`](docs/testing/test-plan.md) — estrategia de pruebas.
- [`docs/decisions/`](docs/decisions/) — Architecture Decision Records (ADRs).
- [`docs/roadmap.md`](docs/roadmap.md) — plan de fases.

## OCR Pipeline (Fase 4)

Motor OCR propio, de extremo a extremo, desarrollado desde cero por el equipo (sin
Tesseract/OpenCV/ML de terceros — `CLAUDE.md` §7): preprocesamiento (4a) →
segmentación (4b) → HOG + kNN propios (4c) → entrenamiento sintético (4d) →
reconstrucción de texto + extracción de campos (4e) → evaluación (4f).

**Campos extraídos (RF-003):** Proveedor, NIT, Fecha, IVA, Valor, Total.

| Métrica | Valor medido | Contexto |
|---|---|---|
| Accuracy de caracteres | 88.2% | Dataset 100% sintético (alfabeto de 2 formas conocidas) — **no** representa facturas reales todavía |
| Performance | ~4849 ms | Factura sintética representativa (~1184 caracteres), Fase 4e — dentro de <5s (RNF-001) con margen mínimo |
| Reproducibilidad | 100% | Misma imagen, 5 corridas, varianza exacta = 0 |

**v1 es 100% sintético.** El modelo kNN activo (si lo hay) fue entrenado con
caracteres generados por Canvas, no con facturas reales de Mansor — la partición
`test` real de `ocr_training_samples` sigue vacía. Mejora planeada con datos reales
etiquetados en Fase 5+ (ver sección siguiente).

Documentación técnica completa: [`docs/ocr/README.md`](docs/ocr/README.md).

## ⏳ Pendientes: Andres & Santiago (Fase 4 Follow-up)

**Estado (actualizado 2026-09-07):** primer reentrenamiento con datos reales ya
corrido. `trainAndEvaluateModel` sobre 10,662 muestras de `train`, evaluado contra
2,427 muestras reales de `test`: **67.4% de character accuracy** (accuracy del
clasificador kNN por carácter individual, no la accuracy de campo/documento completo —
ver la distinción en el punto 2️⃣ y en `docs/ocr/evaluation.md` §6). Ese modelo ya fue
activado (`ocr_models.active = true`) — es el que usa `/documents/[id]` hoy. Sube desde
el 16.1% del modelo 100% sintético (Fase 5), una mejora real de +51.3 puntos.

**`ocr_training_samples` hoy: ~15,000 muestras reales** — `train` ≈10,662 (sigue
creciendo, priorizando las clases raras que quedaban bajas), `validation` y `test` se
mantienen estables desde el 25/08 (2,442 / 2,427) porque el foco pasó a reforzar
`train`. Foco actual del equipo: seguir subiendo el character accuracy con más
`train` en las clases débiles, y medir la accuracy de campo real (RF-003) — todavía sin
medir, es una métrica distinta (ver 2️⃣).

### 1️⃣ ~~Poblar `validation`/`test`~~ — RESUELTO (2026-08-25)

Meta cumplida: `validation` (2,442) y `test` (2,427) ya tienen dataset real de sobra
para evaluar. Sigue habiendo margen para mejorar cobertura por clase si alguien quiere
seguir etiquetando (ver nota de clases raras abajo), pero **ya no bloquea nada.**

**24 de 62 clases siguen por debajo de la meta de 100 muestras/clase** (contando las tres
particiones juntas) — todas letras poco frecuentes en facturas en español, esperado, no
hace falta forzar etiquetado artificial para rellenarlas:
```
x:3  z:3  k:4  w:6  Z:10  j:12  K:14  Q:14  q:14  X:15  J:22  y:23
W:26  g:32  v:32  h:34  H:39  u:42  Y:51  f:56  G:58  p:67  m:70  b:82
```

**Nota sobre el importador de PDF (`npm run import:pdf-samples`):** se construyó y probó
como atajo para `train`, pero **sigue sin recomendarse usarlo** — contra las 55 facturas
reales completas, hasta un tercio-mitad de las muestras salieron mal etiquetadas (el
emparejamiento de líneas puede acertar con la línea vecina equivocada sin que el chequeo
de conteo lo detecte). No se guardó nada de esa corrida. Detalle completo, causa raíz y
pendiente de arreglo en
`docs/decisions/0002-import-pdf-facturas-electronicas-dataset.md`. Las 140 muestras de un
experimento anterior con PDF (antes de detectar el problema) siguen en `train` sin
borrar, marcadas `source: "pdf_text_layer"` sin `matchConfidence` en `feature_data` —
decisión explícita de dejarlas ahí por ahora.

### 2️⃣ Reentrenar y evaluar con datos reales — PRIMERA MEDICIÓN LISTA (2026-09-07)

**Resultado real, medido, no estimado:** `trainAndEvaluateModel` sobre 10,662 muestras
de `train`, evaluado contra 2,427 de `test` real → **67.4% character accuracy**
(+51.3 puntos sobre el 16.1% sintético). Modelo activado — `/documents/[id]` ya lo usa.

**Ojo con la métrica — no confundir dos cosas distintas:**
- **Character accuracy (67.4%, ya medido):** de cada carácter individual segmentado,
  qué % el kNN clasifica bien. Es lo que reporta el botón "Entrenar modelo".
- **Field accuracy (RF-003, todavía sin medir):** de una factura completa, qué % de los
  6 campos obligatorios (Proveedor, NIT, Fecha, IVA, Valor, Total) salen exactamente
  correctos. Los objetivos progresivos de `docs/ocr/evaluation.md` §4 (>70% / >80% /
  ≥85%) son sobre **esta** métrica, no sobre character accuracy — 67.4% de caracteres
  no equivale a 67.4% de campos correctos (un solo carácter mal en un NIT ya invalida
  el campo completo). Falta correr esa medición aparte antes de comparar contra esos
  umbrales.

**¿Qué sigue?**
- Seguir subiendo `train` en las clases que quedaron débiles (ver lista de clases raras
  arriba) para subir el character accuracy — es la palanca más directa ahora mismo.
- Correr **"Evaluar modelo activo sobre 'test'"** (panel de evaluación, Fase 4f) para
  obtener el desglose por clase y la matriz de confusión, y anotarlo en
  `docs/ocr/evaluation.md` §6 junto al 67.4%.
- Medir field accuracy real: validar un lote de facturas reales en `/documents/[id]`
  (punto 3️⃣) y comparar `original_extracted_data` vs `validated_data` para sacar el
  % real por campo — sin esto no se puede reportar avance contra los objetivos
  progresivos de RF-003.
- Si una corrida futura da peor que la activa, no reactivar sin comparar — "Activar
  este modelo" sigue siendo manual a propósito.

### 3️⃣ Validación y corrección de campos (CONTINUO)

**¿Qué hacer?**
- Subir facturas en `/documents/new`
- En `/documents/[id]` click "Procesar documento" → aparece la tabla de validación
  (RF-007, Fase 5): revisa cada campo, click "Editar" para corregir el valor real,
  Enter confirma
- Click "Guardar validación" cuando termines de revisar los 6 campos, o "Rechazar
  documento" si la captura no sirve
- **Nota:** esta UI ya está integrada a `main` (Fase 5) — la interacción real (edición
  inline, colores de confianza) sigue sin probarse a fondo en navegador por el equipo
  (checklist manual pendiente, ver más abajo). Si algo no funciona como se espera,
  repórtenlo.

**Paralelo a etiquetado:** mientras etiquetan, van probando OCR y reportando fallos.

### Estado actual

| Tarea | Estado | Responsable |
|-------|--------|-------------|
| Fase 4 (OCR v0.4.0-ocr) | ✅ Completada | Claude Code |
| **Etiquetado caracteres reales** | 🟢 **~15,000 muestras** — `train` ≈10,662 / `validation` 2,442 / `test` 2,427 | **Andres & Santiago** |
| **Poblar validation/test** | ✅ **RESUELTO** (2026-08-25) — meta de ~300 c/u superada por 8x | **Andres & Santiago** |
| **Reentrenamiento + evaluación del modelo** | 🟡 **Character accuracy: 67.4%** (2026-09-07), modelo activado. Field accuracy (RF-003) aún sin medir | **Andres & Santiago** |
| Fase 5 (Validación humana / RF-007) | ✅ Integrada a `main` | Claude Code |
| **Probar UI de validación en `/documents/[id]` (checklist manual)** | ⏳ **PENDIENTE** | **Andres & Santiago** |
| Fase 6 (Admin) | ✅ Integrada a `main` | Claude Code |
| Fase 7 (Testing: regresión real + Playwright sin ejecutar) | ✅ Integrada a `main`, ⏳ ejecución E2E/checklist manual pendiente | Claude Code / Andres & Santiago |
| Fase 8 (Deploy) | 🔧 En cierre, esperando aprobación para merge + tag `v0.5.0-complete` | Claude Code |

### Para Andres & Santiago

**Step 1: ~~Poblar validation/test~~ — YA HECHO** (`validation` 2,442 / `test` 2,427,
2026-08-25). Si quieren seguir etiquetando para subir cobertura de las 24 clases raras
que siguen bajo 100 muestras (ver lista arriba), el flujo es el mismo de siempre en
`/ocr-lab/train/` eligiendo la partición antes de guardar — pero no es requisito para
avanzar al Step 3.

**Step 2: Validar OCR**
```
1. `/documents/new` → sube factura
2. `/documents/[id]` → click "Procesar documento" → revisa campos extraídos
3. Click "Editar" en el campo que esté mal, corrige, Enter confirma (ver punto 3️⃣ arriba)
4. "Guardar validación" o "Rechazar documento" si la captura no sirve
```

**Step 3: Reentrenar y evaluar — YA HAY UNA PRIMERA MEDICIÓN (67.4%, 2026-09-07)**
```
1. `/ocr-lab/train/` — sigue siendo el mismo flujo si quieren mejorar el número
2. Click "Entrenar modelo" (evalúa contra `test` automáticamente)
3. Click "Evaluar modelo activo sobre 'test'" para el desglose por clase/confusión
4. Click "Activar este modelo" (paso manual aparte) solo si el número nuevo supera
   al que ya está activo (67.4% hoy, no 16.1%)
```

### FAQ

**P: ¿Qué pasa si me equivoco?**
R: Dataset grande, 1-2 errores no importan. Puedes re-etiquetar.

**P: ¿Por qué falla el OCR?**
R: El modelo activo hoy es el entrenado con datos reales (67.4% character accuracy,
2026-09-07) — mejor que el sintético original (16.1%), pero todavía falla en clases
poco frecuentes (ver lista de clases raras arriba) y en pares de glifos parecidos
(`C`/`G`, `S`/`5`, `I`/`l`, `o`/`q`). Sigue mejorando con más `train` en esas clases.

### Documentación

- Algoritmos: [`docs/ocr/algorithms.md`](docs/ocr/algorithms.md)
- Extracción: [`docs/ocr/extraction.md`](docs/ocr/extraction.md)
- Entrenamiento: [`docs/ocr/training.md`](docs/ocr/training.md)
- Evaluación: [`docs/ocr/evaluation.md`](docs/ocr/evaluation.md)

## 🏆 Estado final — Fase 8

**Fases 4-7 integradas a `main`; Fase 8 en cierre, esperando aprobación.** Esto es un MVP funcional de punta a punta con datos
**sintéticos** — no un sistema terminado con accuracy usable sobre facturas reales de
Mansor todavía. Ver `CLAUDE.md` §13 y `docs/requirements/traceability.md` para el
detalle completo fase por fase; esta sección resume solo los números reales, medidos en
esta sesión (nunca estimados).

### Status por componente

| Componente | Estado | Notas |
|---|---|---|
| OCR Pipeline (4a-4f) | ✅ Implementado | Preprocesamiento → segmentación → clasificación (HOG+kNN propios) → extracción de 6 campos → evaluación. Sin dependencias de OCR/CV/ML de terceros (`CLAUDE.md` §7). |
| UI de validación (5) | ✅ Implementado, sin verificación visual | Edición inline, estados ✅/🔧/⏳, persistencia real contra Supabase — interacción en navegador pendiente de verificación manual (`CLAUDE.md` §11). |
| Admin panel (6) | ✅ Implementado, sin verificación visual | Dashboard, documentos, validaciones, modelos, reportes CSV/JSON. |
| Testing (7) | ✅ Regresión real + ⚠️ E2E sin ejecutar | Ver tabla de métricas abajo. Playwright escrito y corregido contra el código real, nunca corrido en esta sesión (`CLAUDE.md` §11). |
| Deploy (8) | ⏳ Sin confirmar | No hay evidencia en este repo (`vercel.json`, `.vercel/`) de un deploy activo — ver [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) para las instrucciones reales de cómo desplegarlo. |

### Métricas reales (medidas, no estimadas)

| Métrica | Valor real | Objetivo | Cumple |
|---|---|---|---|
| Tests | 323/323 passed, 0 fallos | — | ✅ |
| Cobertura (statements) | 95.1% — solo de los módulos que los tests importan (lógica pura); Server Actions/Route Handlers/páginas quedan fuera por depender de `next/headers` | — | — (no comparable a "90% de rutas críticas") |
| Performance OCR | 4849.2 ms, factura sintética representativa (~1184 caracteres), Fase 4e | <5000 ms (RNF-001) | ⚠️ dentro del límite, margen mínimo |
| Reproducibilidad | 100% (varianza 0 exacta, 5 corridas) | 100% | ✅ |
| Campos extraídos (RF-003) | 6/6 (Proveedor, NIT, Fecha, IVA, Valor, Total) | 6 | ✅ |
| **Character accuracy del modelo activo** | **67.4%** — 62 clases, kNN entrenado con 10,662 muestras `train` reales, medido sobre 2,427 muestras `test` reales de facturas de Mansor (2026-09-07) | — | 🟡 mejora real de +51.3 pts sobre el 16.1% sintético; sigue habiendo clases débiles (ver "⏳ Pendientes") |
| **Field accuracy (RF-003)** | Sin medir todavía | >70% (`docs/ocr/evaluation.md` §4, hito 1) | ⏳ requiere validar un lote real en `/documents/[id]` y comparar contra `validated_data` |

**Sobre el 67.4%:** es character accuracy (aciertos por carácter individual
clasificado), no field accuracy — son métricas distintas, ver la aclaración completa en
"⏳ Pendientes" punto 2️⃣. Es el número real del modelo *actualmente activo*
(`ocr_models`, reentrenado 2026-09-07 con datos reales de OCR LAB, ya no el sintético de
Fase 5). Una corrida distinta y no comparable, de Fase 4f, midió 88.2% sobre un alfabeto
sintético de solo 2 formas (17 muestras) para validar que la aritmética de evaluación
era correcta — nunca fue el modelo activo ni una cifra representativa. El field accuracy
de RF-003 (el que sí tiene objetivos progresivos definidos: >70/>80/≥85%) sigue sin
medirse contra facturas reales — es el siguiente número real pendiente, no el de arriba.

### Versión

Tag de este cierre: `v0.5.0-complete` (se crea al fusionar esta fase a `main`, junto con
el merge — `CLAUDE.md` §3, tags solo al integrar). Ver [`CHANGELOG.md`](CHANGELOG.md)
para el historial completo.

## Proceso de trabajo

 Una rama de Git por fase
(`fase/N-nombre`), integración a `main` solo tras aprobación explícita.

## Datos y confidencialidad

Nunca se suben facturas reales de Mansor, datasets confidenciales ni credenciales al
repositorio. Ver `.gitignore` y `docs/ocr/training.md`.
