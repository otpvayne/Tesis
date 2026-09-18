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

Motor OCR propio, de extremo a extremo, desarrollado desde cero por el equipo:
preprocesamiento (4a) → segmentación (4b) → HOG + kNN propios (4c) → entrenamiento
sintético (4d) → reconstrucción de texto + extracción de campos (4e) → evaluación (4f).
Sigue siendo el aporte académico medido de la tesis y no se elimina ni se deja de
mantener (`CLAUDE.md` §7). **Ya no es cierto que el proyecto completo esté libre de
OCR de terceros** — desde ADR-0002, Tesseract.js está aprobado como motor adicional
(sección siguiente); la restricción de "construido desde cero" sigue aplicando solo al
pipeline propio en sí (`modules/ocr/pipeline/`, `classification/`, `segmentation/`,
`preprocessing/`).

**Campos extraídos (RF-003), perfil `invoice_es`:** Proveedor, NIT, Fecha, IVA, Valor, Total.

**Segundo perfil, `contract_es`** (ADR-0003, `docs/decisions/0003-perfil-ocr-contratos.md`,
sección "Contratos" separada en la app): Proveedor, NIT/documento, Fecha, Valor total,
Vigencia, Tipo de contrato, Número de contrato — usa Tesseract.js siempre, no el
pipeline propio (sin dataset de contratos reales para entrenar o evaluar todavía).

| Métrica | Valor medido | Contexto |
|---|---|---|
| Accuracy de caracteres (real) | **73.8%** (1,792/2,427) | Partición `test` real de `ocr_training_samples`, facturas reales de Mansor — modelo activo `invoice_es` (`version=2026-09-07T17:28:15.287Z`), medido con `npm run verify:model-accuracy`. Detalle: `docs/ocr/evaluation.md` §6 |
| Accuracy de caracteres (sintético, Fase 4f) | 88.2% | Alfabeto de 2 formas conocidas (17 muestras) — solo valida la aritmética de evaluación, no representativo |
| Performance | ~4849 ms | Factura sintética representativa (~1184 caracteres), Fase 4e — dentro de <5s (RNF-001) con margen mínimo. Sin medición real de `processing_ms` sobre facturas reales todavía |
| Reproducibilidad | 100% | Misma imagen, 5 corridas, varianza exacta = 0 |

**El dataset de `invoice_es` ya tiene datos reales.** 22,878 caracteres reales
etiquetados (17,411 `train` / 3,040 `validation` / 2,427 `test`), importados desde
facturas reales de Mansor vía PDF (`bin/import-pdf-training-samples.ts`, rama
`feature/ocr-dataset-plan` — el script aún no está mergeado a esta rama/`main`, pero ya
se corrió contra el Supabase compartido real). El modelo activo mide **73.8%** sobre
esa partición `test` real (arriba) — todavía no alcanza el 80%/85% objetivo de
`docs/ocr/evaluation.md` §4, pero ya no es una cifra sintética. **`contract_es` sigue
sin ningún dato real** en ninguna partición (ver ADR-0003).

Documentación técnica completa: [`docs/ocr/README.md`](docs/ocr/README.md).

### Motor alternativo: Tesseract.js (excepción aprobada 2026-09-08)

Mientras el pipeline propio mejora su accuracy real sobre facturas reales, el equipo
(con aprobación explícita de Diego) agregó **Tesseract.js** como motor de
reconocimiento alternativo/de contingencia, aislado en
`src/modules/ocr/engines/tesseract-engine.ts` y activable con la variable de entorno
`NEXT_PUBLIC_OCR_ENGINE=tesseract` (por defecto sigue siendo `custom`, el pipeline
propio, sin cambiar nada). El pipeline propio (HOG+kNN desde cero) no se modificó ni se
eliminó — sigue siendo el aporte académico medido de esta tesis. Detalle completo de la
excepción, su alcance y el riesgo documentado para la sustentación: `CLAUDE.md` §7.

## ⏳ Pendientes: Andres & Santiago (Fase 4 Follow-up)

**Estado (actualizado 2026-09-10):** el dataset de `invoice_es` **ya no es sintético**.
Se importaron caracteres reales de facturas de Mansor en bloque, vía PDF
(`bin/import-pdf-training-samples.ts`, rama `feature/ocr-dataset-plan` — el código aún
no está mergeado a esta rama/`main`, pero ya se corrió contra el Supabase compartido
real, así que el dato en sí ya existe). Reparto real verificado el 2026-09-10:
**17,411 `train` / 3,040 `validation` / 2,427 `test`** (76% / 13% / 11%, razonablemente
cerca de la meta 70/15/15). El modelo activo ya se reentrenó y evaluó con esos datos:
**73.8% de accuracy real (1,792/2,427 caracteres, 59 clases)** — reemplaza al 16.1%
sintético que aparecía antes en esta sección (ver "🏆 Estado final — Fase 8" más abajo).
Los puntos 1️⃣ y 2️⃣ que bloqueaban esto ya están resueltos; lo que sigue abierto es
mejorar esa cifra y medir sobre campos completos, no solo caracteres sueltos.

### 1️⃣ Dataset repartido y modelo reentrenado con datos reales — ✅ HECHO

No hace falta re-etiquetar ni redistribuir nada para llegar a esta medición — ya está
hecho (ver estado arriba). Sigue abierto, sin ser bloqueante:
- **Ampliar el dataset** (más PDFs, o etiquetado manual en `/ocr-lab/train` para
  reforzar clases específicas) para subir el 73.8% hacia el 80%/85% objetivo de
  `docs/ocr/evaluation.md` §4 — las confusiones más frecuentes (`l`↔`I`, `0`↔`D`,
  `i`↔`I`, `2`↔`3`, `8`↔`B`, `a`↔`A`/`8`) son un buen punto de partida para saber qué
  clases necesitan más ejemplos.
- **`contract_es` sigue en 0 muestras** en las tres particiones — sin dataset real
  todavía (ver ADR-0003, `docs/decisions/0003-perfil-ocr-contratos.md`).

### 2️⃣ Medir field accuracy real (PENDIENTE — no cubierto por la medición anterior)

`bin/verify-active-model-accuracy.ts` mide solo **character accuracy**, prediciendo
directo sobre el descriptor HOG guardado (`ocr_training_samples.feature_data`), sin
reconstruir documentos completos. Falta todavía medir accuracy **por campo**
(proveedor/nit/fecha/iva/valor/total) sobre facturas reales completas — eso requiere
correr el pipeline de extremo a extremo (`runOCRPipelineOnImageData`) contra imágenes
reales, no solo caracteres sueltos ya segmentados. Ver `docs/ocr/evaluation.md` §2/§6.

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
| **Caracteres reales importados (`invoice_es`)** | ✅ **Hecho** — 22,878 (17,411/3,040/2,427 train/validation/test), vía import de PDFs (`feature/ocr-dataset-plan`) | — |
| **Reentrenamiento + evaluación del modelo** | ✅ **Hecho** — 73.8% real sobre `test` (1,792/2,427) | — |
| **Subir accuracy real hacia 80%/85%** | ⏳ **PENDIENTE** — ampliar dataset en las clases más confundidas | **Andres & Santiago** |
| **Field accuracy real (por campo, no solo caracteres)** | ⏳ **PENDIENTE** — no medido todavía | **Andres & Santiago** |
| **Dataset real de `contract_es`** | ⏳ **PENDIENTE** — 0 muestras en las 3 particiones | **Andres & Santiago** |
| Fase 5 (Validación humana / RF-007) | ✅ Integrada a `main` | Claude Code |
| **Probar UI de validación en `/documents/[id]` (checklist manual)** | ⏳ **PENDIENTE** | **Andres & Santiago** |
| Fase 6 (Admin) | ✅ Integrada a `main` | Claude Code |
| Fase 7 (Testing: regresión real + Playwright sin ejecutar) | ✅ Integrada a `main`, ⏳ ejecución E2E/checklist manual pendiente | Claude Code / Andres & Santiago |
| Fase 8 (Deploy) | 🔧 En cierre, esperando aprobación para merge + tag `v0.5.0-complete` | Claude Code |

### Para Andres & Santiago

**Step 1 (opcional): ampliar el dataset real**

El import de PDFs (`feature/ocr-dataset-plan`) ya pobló las tres particiones — no es
obligatorio etiquetar a mano para tener algo que medir. Si quieren subir el 73.8%
actual, dos caminos, no excluyentes: importar más PDFs de facturas de Mansor, o
reforzar a mano en OCR LAB las clases más confundidas (`l`/`I`, `0`/`D`, `2`/`3`,
`8`/`B`, `a`/`A`):
```
1. Abre https://tesis-sigma-bay.vercel.app → /ocr-lab/train/
2. Sube una factura de Mansor
3. Para cada carácter: dropdown → selecciona letra correcta
4. ANTES de guardar: revisa el selector de partición (train/validation/test) —
   por defecto queda en "train"; hay que cambiarlo a mano para que algo caiga
   en validation/test
5. Click "Guardar etiquetas"
```

**Step 2: Validar OCR**
```
1. `/documents/new` → sube factura
2. `/documents/[id]` → click "Procesar documento" → revisa campos extraídos
3. Click "Editar" en el campo que esté mal, corrige, Enter confirma (ver punto 3️⃣ arriba)
4. "Guardar validación" o "Rechazar documento" si la captura no sirve
```

**Step 3: Reentrenar y evaluar (si ampliaron el dataset)**
```
1. `/ocr-lab/train/`
2. Click "Entrenar modelo"
3. Click "Evaluar modelo activo sobre 'test'" y anotar la accuracy real
4. Click "Activar este modelo" (paso manual aparte) solo si mejora el 73.8% actual
```

### FAQ

**P: ¿Cuánto tiempo toma etiquetar a mano?**
R: ~5 segundos por carácter. 1,500 caracteres = 3-4 horas — pero ya no es obligatorio
partir de cero, el dataset real ya tiene 22,878 caracteres importados.

**P: ¿Qué pasa si me equivoco?**
R: Puedes re-etiquetar cualquier muestra individual.

**P: ¿Por qué el OCR no reconoce todo bien?**
R: El modelo activo mide 73.8% de accuracy real sobre facturas reales de Mansor (no
16.1% sintético como antes) — mejor que antes, pero todavía por debajo del 80%/85%
objetivo. Las confusiones más frecuentes son entre glifos parecidos (`l`/`I`, `0`/`D`,
`2`/`3`). Ver puntos 1️⃣ y 2️⃣ arriba para cómo seguir mejorándolo.

### Documentación

- Algoritmos: [`docs/ocr/algorithms.md`](docs/ocr/algorithms.md)
- Extracción: [`docs/ocr/extraction.md`](docs/ocr/extraction.md)
- Entrenamiento: [`docs/ocr/training.md`](docs/ocr/training.md)
- Evaluación: [`docs/ocr/evaluation.md`](docs/ocr/evaluation.md)

## 🏆 Estado final — Fase 8

**Fases 4-7 integradas a `main`; Fase 8 en cierre, esperando aprobación.** Esto es un MVP
funcional de punta a punta. El dataset de caracteres de `invoice_es` **ya no es
sintético** (22,878 caracteres reales de facturas de Mansor, 73.8% accuracy real sobre
`test` — ver sección "OCR Pipeline" arriba y `docs/ocr/evaluation.md` §6), pero
**field accuracy sobre documentos completos reales todavía no se ha medido**, y
`contract_es` sigue sin ningún dato real. No es todavía un sistema con accuracy por
campo verificada sobre facturas reales de Mansor de punta a punta. Ver `CLAUDE.md` §13 y
`docs/requirements/traceability.md` para el detalle completo fase por fase; esta sección
resume solo los números reales, medidos (nunca estimados).

### Status por componente

| Componente | Estado | Notas |
|---|---|---|
| OCR Pipeline (4a-4f) | ✅ Implementado | Preprocesamiento → segmentación → clasificación (HOG+kNN propios) → extracción de 6 campos → evaluación. Pipeline propio construido desde cero (`CLAUDE.md` §7); el proyecto en conjunto también admite Tesseract.js (ADR-0002) como motor adicional/de contingencia, ver sección "OCR Pipeline" arriba. |
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
| **Accuracy del modelo activo** | **73.8%** (1,792/2,427) — 59 clases, medido sobre la partición `test` **real** de `invoice_es` (facturas de Mansor, no sintético), `ocr_models.version=2026-09-07T17:28:15.287Z` | 80% (§4.3 de `docs/ocr/evaluation.md`) | ⚠️ por debajo del objetivo, por encima del >70% inicial (§4.2) |

**Sobre el 73.8%:** es el número de accuracy real y actual del modelo *realmente
activo* hoy (`ocr_models`), medido con `bin/verify-active-model-accuracy.ts`
(`npm run verify:model-accuracy`) contra 2,427 caracteres reales de facturas de Mansor
— reproducido el 2026-09-10, mismo resultado. Dos cifras anteriores, ya obsoletas, no
representan el estado actual: **16.1%** fue la primera activación del modelo (Fase 5),
antes de que existiera dataset real, sobre un split 100% sintético; **88.2%** fue una
corrida de Fase 4f sobre un alfabeto sintético de solo 2 formas (17 muestras) para
validar que la aritmética de evaluación era correcta, nunca representó al modelo
activo. `contract_es` sigue sin ningún dato real (0 muestras) — no hay número de
accuracy que reportar para ese perfil todavía.

### Versión

Tag de este cierre: `v0.5.0-complete` (se crea al fusionar esta fase a `main`, junto con
el merge — `CLAUDE.md` §3, tags solo al integrar). Ver [`CHANGELOG.md`](CHANGELOG.md)
para el historial completo.

## 🎥 Guion del video de sustentación — reparto por integrante

División del código/funcionamiento del proyecto en 3 partes para el video, una por
integrante. Cada quien revisa solo su sección antes de grabar — si algo no está claro,
preguntar en el grupo antes, no improvisar en cámara.

### 1️⃣ Diego — Arquitectura básica

Cómo está armado el sistema por fuera del OCR: stack, estructura de carpetas, modelo de
datos, seguridad.

- **Stack y despliegue:** Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
  `strict`, Supabase (PostgreSQL, Auth nativo, Storage), Vercel. Ver tabla de versiones
  reales en la sección ["Stack"](#stack) arriba.
- **Estructura de la app** (`src/app/`): grupos de rutas `(auth)/` (login/registro) y
  `(dashboard)/` (`documents/`, `contracts/`, `ocr-lab/`, `admin/`, `reports/`),
  Route Handlers en `api/`, `src/proxy.ts` (antes `middleware.ts`, renombrado en
  Next 16) protegiendo `/admin/*` con chequeo optimista de sesión.
- **Módulos de dominio** (`src/modules/`): `auth/`, `documents/`, `camera/`, `admin/`,
  `audit/` — separados del módulo `ocr/` (que cubre Santiago). Server
  Components/Client Components/Route Handlers usados solo donde aporta, no todo es
  `"use client"`.
- **Modelo de datos y seguridad:** tablas principales (`documents`, `document_pages`,
  `document_validations`, `ocr_models`, `ocr_training_samples`, `audit_logs`), roles
  **USER**/**ADMIN**, y por qué el aislamiento de datos vive en **Row Level Security de
  Postgres** y no en el frontend — `SUPABASE_SERVICE_ROLE_KEY` nunca llega al navegador.
  Detalle: [`docs/architecture/overview.md`](docs/architecture/overview.md) y
  [`docs/architecture/data-model.md`](docs/architecture/data-model.md).
- **Captura de imagen:** `CameraCapture` (`navigator.mediaDevices.getUserMedia()`) con
  fallback a `<input type="file">` sin `capture="environment"` (para no bloquear elegir
  foto de galería en móvil — ver `CLAUDE.md` §4).

### 2️⃣ Santiago — Funcionamiento y entrenamiento del OCR

El motor OCR propio de punta a punta, y cómo se entrena. Esta es la parte medida y
evaluable de la tesis — la que responde si el pipeline "desde cero" realmente funciona.

- **Pipeline propio** (`src/modules/ocr/`), etapa por etapa: preprocesamiento
  (`preprocessing/` — grayscale, histograma, Otsu, binarización, morfología) →
  segmentación (`segmentation/` — componentes conectados, normalización de carácter a
  32×32) → clasificación (`classification/` — HOG propio + kNN propio) → extracción de
  campos (`pipeline/`, `field-extraction.ts` — cómo se arma texto reconocido en
  Proveedor/NIT/Fecha/IVA/Valor/Total, con las heurísticas y bugs reales resueltos
  documentados en `CLAUDE.md` §13) → evaluación (`evaluation/`). Fórmulas documentadas
  en [`docs/ocr/algorithms.md`](docs/ocr/algorithms.md).
- **Confidence score:** siempre calculado desde información real del pipeline (nunca
  aleatorio) — mostrar de dónde sale el número que ve el usuario en la validación.
- **Entrenamiento (OCR LAB, solo admin):** `/ocr-lab/train`, `src/modules/ocr/training/`
  — split estricto train/validation/test, por qué `test` nunca se usa para entrenar,
  cómo se etiqueta un carácter, cómo se activa un modelo nuevo. Detalle:
  [`docs/ocr/training.md`](docs/ocr/training.md).
- **Resultado real medido:** accuracy actual del modelo activo (ver tabla en "OCR
  Pipeline" arriba — **73.8%** sobre la partición `test` real, no sintética), qué
  confusiones de caracteres son más frecuentes y por qué (`l`/`I`, `0`/`D`, etc. — ver
  `CLAUDE.md` §13, causa estructural documentada en `docs/ocr/training.md` §7.5.3).
- **Perfiles OCR:** `invoice_es` (modelo propio HOG+kNN) vs. `contract_es` (siempre
  Tesseract.js, sin modelo propio entrenado — ver ADR-0003). Explicar honestamente el
  motor Tesseract.js como plan de contingencia de terceros, **no** parte del pipeline
  propio medido (`CLAUDE.md` §7, riesgo documentado para la sustentación).

### 3️⃣ Andres — Resto del sistema (flujo de usuario, validación, admin, testing)

Todo lo que conecta la arquitectura de Diego con el OCR de Santiago en un producto
usable, y cómo se verificó.

- **Flujo de usuario (RF-001/RF-004/RF-005):** subir/capturar documento
  (`/documents/new`, `/contracts/new`), almacenamiento en Supabase Storage (bucket
  privado, URLs firmadas, ruta `{user_id}/{document_id}/...`), consulta con filtros
  (`/documents`), soporte multi-página para contratos (`document_pages`).
  Módulo: `src/modules/documents/`.
- **Validación humana (RF-007):** `/documents/[id]`, botón "Procesar documento",
  `ValidationSection`/`ValidationSummary` — edición inline de campos, trazabilidad
  original vs. validado en `document_validations`, botón "Rechazar documento".
- **Panel de administración (Fase 6):** `/admin` (KPIs reales), `/admin/documents`,
  `/admin/validations` (tendencia de ediciones por usuario), `/admin/models`
  (activar/desactivar modelo OCR), `/admin/reports` (CSV/JSON descargables).
- **Testing y calidad:** separación unit/integration/e2e/OCR benchmark
  (`docs/testing/test-plan.md`), estado real de la suite (323/323 tests, 95.1% de
  cobertura de statements en los módulos con tests — ver "🏆 Estado final — Fase 8"),
  qué quedó pendiente de verificación manual en navegador (`CLAUDE.md` §11) y por qué.
- **Deploy:** qué está listo para Vercel y qué falta confirmar — ver
  [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), sección "Status por componente" arriba.

---

## Proceso de trabajo

 Una rama de Git por fase
(`fase/N-nombre`), integración a `main` solo tras aprobación explícita.

## Datos y confidencialidad

Nunca se suben facturas reales de Mansor, datasets confidenciales ni credenciales al
repositorio. Ver `.gitignore` y `docs/ocr/training.md`.
