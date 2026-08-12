# Mansor — Sistema de Digitalización de Documentos

Proyecto de grado de Ingeniería de Software: digitalización de documentos financieros
físicos (inicialmente facturas de proveedor en español) mediante captura desde
navegador y un motor OCR **desarrollado desde cero por el equipo**, para la empresa
Mansor, en conjunto con NETRIX Corporation.

> Estado actual: **Fase 4f — Evaluación OCR: métricas y benchmark (en cierre).**
> Pipeline propio de extremo a extremo: preprocesamiento (4a) + segmentación (4b) + HOG
> y kNN (4c) + entrenamiento sintético (4d) + reconstrucción de texto y extracción de
> campos (4e) + evaluación (4f), 253 tests. RF-003: **Proveedor, NIT, Fecha, IVA, Valor,
> Total**. Nueva infraestructura `modules/ocr/evaluation/`: accuracy por carácter
> (matriz de confusión dinámica), accuracy/precisión/recall/F1 por campo, benchmark de
> tiempos (P95/P99, cuello de botella real), reproducibilidad, y un generador de reporte
> de texto — más una evaluación real del modelo activo contra la partición `test` real
> de `ocr_training_samples`, disponible en `/ocr-lab/train`. **Sin datos reales
> todavía:** nadie ha etiquetado facturas reales de Mansor en `test`, así que esa
> evaluación lanza un error explícito si se corre hoy. La única corrida hecha esta fase
> usa un alfabeto sintético de 2 formas para validar la aritmética (88.2% character
> accuracy, 100% reproducibilidad — no representan precisión real), ver
> `docs/ocr/evaluation.md` §6. Benchmark representativo sigue siendo el de Fase 4e:
> ~4.85s para una factura sintética de ~1184 caracteres, dentro del objetivo <5s de
> RNF-001 pero con margen mínimo. Ningún modelo está activado todavía — el equipo
> debe correr `/ocr-lab/train` y activar uno antes de que esto funcione end-to-end. Ver
> [`docs/roadmap.md`](docs/roadmap.md) y `CLAUDE.md` §13 para desviaciones pendientes.

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
npm run build
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

**Estado:** v0.4.0-ocr completada. Ahora es turno del equipo de desarrollo.

### 1️⃣ Etiquetado de caracteres reales (CRÍTICO)

El modelo kNN actual es 100% sintético (88.2% accuracy). Para mejorar a 75-85% en facturas reales:

**¿Qué hacer?**
- Abrir [`/ocr-lab/train/`](src/app/(dashboard)/ocr-lab/train/page.tsx) en el deploy
- Subir facturas reales de Mansor
- Para cada carácter segmentado: seleccionar la letra/número correcto en dropdown
- Guardar etiqueta

**Meta:** 100+ muestras por carácter (0-9, A-Z, a-z)
- Total: ~1,000-2,000 caracteres
- Tiempo estimado: 4-6 horas de trabajo

**Importancia:** Bloqueador crítico para accuracy en producción.

### 2️⃣ Validación y corrección de campos (CONTINUO)

**¿Qué hacer?**
- Subir facturas en `/documents/new`
- En `/documents/[id]` click "Procesar documento" y comparar los campos extraídos
  (Proveedor, NIT, Fecha, IVA, Valor, Total) contra la factura real
- **Nota:** todavía no existe un botón "Editar" en la UI — la edición/validación
  manual de campos es RF-007 y está planeada para Fase 5, no implementada aún. Por
  ahora: anotar y reportar discrepancias (documento, campo, valor esperado vs.
  extraído) para priorizar el etiquetado del punto 1.

**Paralelo a etiquetado:** mientras etiquetan, van probando OCR y reportando fallos.

### 3️⃣ Reentrenamiento del modelo (CUANDO TENGAN DATOS)

**¿Qué hacer?**
- En `/ocr-lab/train/` cuando hayan etiquetado 100+ muestras/clase
- Click "Entrenar modelo (kNN sobre 'train', evalúa contra 'test')"
- Revisar la accuracy reportada contra `test`
- Click aparte en "Activar este modelo" para que `/documents/[id]` empiece a usarlo

**No es automático:** entrenar crea un modelo nuevo pero **no** lo activa solo —
activar es un paso manual separado, a propósito (evita reemplazar el modelo en
producción sin confirmar).

### Timeline realista

| Día | Tarea | Progreso |
|-----|-------|----------|
| 1-2 | Etiquetado inicial (0-9, A-Z) | 500-800 caracteres |
| 3-4 | Etiquetado minúsculas y confusos | 800+ caracteres más |
| 5 | Cumplir meta 100+/clase en 6 clases | ~1,500 caracteres totales |
| 6 | Primer reentrenamiento | Accuracy sube a ~75-78% |
| 7+ | Iteración: validar, etiquetar, reentrenar | Convergencia a 80%+ |

### Estado actual

| Tarea | Estado | Responsable |
|-------|--------|-------------|
| Fase 4 (OCR v0.4.0-ocr) | ✅ Completada | Claude Code |
| **Etiquetado caracteres reales** | ⏳ **PENDIENTE** | **Andres & Santiago** |
| **Reentrenamiento del modelo** | ⏳ **PENDIENTE** | **Andres & Santiago** |
| **Validación de campos (reporte manual)** | ⏳ **PENDIENTE** | **Andres & Santiago** |
| Fase 5 (Validación humana / RF-007) | ⏳ Por hacer | Claude Code |
| Fase 6 (Admin) | ⏳ Por hacer | Claude Code |
| Fase 7 (Testing) | ⏳ Por hacer | Claude Code |
| Fase 8 (Deploy) | ⏳ Por hacer | Claude Code |

### Para Andres & Santiago

**Step 1: Empezar a etiquetar**
```
1. Abre https://tesis-sigma-bay.vercel.app → /ocr-lab/train/
2. Sube una factura de Mansor
3. Para cada carácter: dropdown → selecciona letra correcta
4. Click "Guardar etiquetas"
5. Repite hasta tener 100+ caracteres/clase
```

**Step 2: Validar OCR**
```
1. `/documents/new` → sube factura
2. `/documents/[id]` → click "Procesar documento" → revisa campos extraídos
3. Si está mal: anota la discrepancia (todavía no hay edición en UI, ver punto 2 arriba)
```

**Step 3: Reentrenar**
```
1. `/ocr-lab/train/` (después de 100+ muestras/clase)
2. Click "Entrenar modelo"
3. Revisar accuracy contra test
4. Click "Activar este modelo" (paso manual aparte)
```

### FAQ

**P: ¿Cuánto tiempo toma?**
R: ~5 segundos por carácter. 1,500 caracteres = 3-4 horas.

**P: ¿Qué pasa si me equivoco?**
R: Dataset pequeño, 1-2 errores no importan. Puedes re-etiquetar.

**P: ¿Por qué falla el OCR?**
R: v1 es sintético (88.2% accuracy, sin datos reales todavía). Es esperado. Ustedes lo van a mejorar.

### Documentación

- Detalles técnicos: [`docs/ocr/README.md`](docs/ocr/README.md)
- Algoritmos: [`docs/ocr/algorithms.md`](docs/ocr/algorithms.md)
- Extracción: [`docs/ocr/extraction.md`](docs/ocr/extraction.md)
- Evaluación: [`docs/ocr/evaluation.md`](docs/ocr/evaluation.md)

## Proceso de trabajo

 Una rama de Git por fase
(`fase/N-nombre`), integración a `main` solo tras aprobación explícita.

## Datos y confidencialidad

Nunca se suben facturas reales de Mansor, datasets confidenciales ni credenciales al
repositorio. Ver `.gitignore` y `docs/ocr/training.md`.
