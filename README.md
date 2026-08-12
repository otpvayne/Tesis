# Mansor — Sistema de Digitalización de Documentos

Proyecto de grado de Ingeniería de Software: digitalización de documentos financieros
físicos (inicialmente facturas de proveedor en español) mediante captura desde
navegador y un motor OCR **desarrollado desde cero por el equipo**, para la empresa
Mansor, en conjunto con NETRIX Corporation.

> Estado actual: **Fase 4c — Clasificación OCR (en cierre).** Pipeline propio completo
> hasta clasificación de caracteres: preprocesamiento (Fase 4a) + segmentación (Fase 4b)
> + HOG y kNN propios (Fase 4c), 199 unit tests. `/ocr-lab/preview` (solo ADMIN) segmenta
> y muestra el resultado; `/ocr-lab/train` (solo ADMIN, nuevo) permite etiquetar
> caracteres y entrenar/evaluar un kNN sobre lo etiquetado — sin dataset real todavía
> (llega en Fase 4d). Extracción de campos y pipeline end-to-end siguen pendientes
> (Fase 4e en adelante). Ver [`docs/roadmap.md`](docs/roadmap.md) — nota: la UI de
> etiquetado se adelantó de Fase 4d a 4c por pedido explícito del equipo, desviación
> del roadmap fijo que queda pendiente de reconciliar (ver cierre de Fase 4c).

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
7), extrae proveedor / fecha / monto total (y de forma deseada el número de factura)
para facturas en español, permite validación humana de lo detectado y almacena todo en
Supabase con aislamiento estricto por usuario vía Row Level Security.

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

## Proceso de trabajo

 Una rama de Git por fase
(`fase/N-nombre`), integración a `main` solo tras aprobación explícita.

## Datos y confidencialidad

Nunca se suben facturas reales de Mansor, datasets confidenciales ni credenciales al
repositorio. Ver `.gitignore` y `docs/ocr/training.md`.
