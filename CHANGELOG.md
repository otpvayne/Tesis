# Changelog — Mansor OCR Project

Formato de versión según `CLAUDE.md` §3: `vX.Y.Z-nombre`, tag solo al integrar una fase
importante a `main`. Ninguna cifra en este archivo es estimada — todas se midieron
realmente en la sesión que cerró la fase correspondiente (ver
`docs/requirements/traceability.md` para el detalle completo y la metodología de cada
medición).

## [v0.5.0-complete] — 2026-08-13

Fases 5-8 integradas a `main`. **MVP funcional de punta a punta con datos sintéticos**
— no un sistema con accuracy usable sobre facturas reales de Mansor todavía (esa
partición de datos sigue vacía). "Complete" se refiere a que las 8 fases planeadas
tienen una implementación funcional integrada, no a que el producto esté listo para
producción con datos reales.

### Fase 5 — Validación humana (RF-007)
- Tabla interactiva de 6 campos en `/documents/[id]`: colores de confianza, edición
  inline, estados ✅/🔧/⏳, botones "Guardar validación"/"Rechazar documento".
- Persistencia en `document_validations` (tabla ya existente desde Fase 1, reutilizada).
- Modelo OCR activado por primera vez (`npm run generate:model`, síntesis vía
  `node-canvas` en Node) — accuracy real medida: **16.1%** (62 clases, sobre su propio
  split sintético de test, no facturas reales).

### Fase 6 — Administración
- `/admin` (dashboard con KPIs reales), `/admin/documents` (confidence OCR + búsqueda
  por id), `/admin/validations` (ediciones por usuario + tendencia), `/admin/models`
  (activar/desactivar), `/admin/reports` (CSV/JSON descargables).
- `src/proxy.ts`: gate de sesión para `/admin/*` (chequeo optimista, no de rol — el rol
  se verifica por página + RLS).

### Fase 7 — Testing
- Suite completa: **323/323 tests, 0 fallos**, 52 archivos, ~24s.
- Cobertura real (`@vitest/coverage-v8`, nuevo): **95.1% statements / 85.7% branches /
  94.3% funciones / 96.1% líneas** — de los módulos que los tests importan (lógica
  pura). Server Actions, Route Handlers, `proxy.ts` y los `page.tsx` quedan fuera de
  ese número porque dependen de `next/headers`/renderizado real, no porque fallen algo.
- Gap de seguridad real cerrado: `ocr_models`/`ocr_training_samples` (RLS
  `is_admin()`-only desde Fase 1) nunca se habían probado contra una sesión real —
  ahora 11/11 (`tests/integration/admin-only-tables-rls.test.ts`).
- 4 archivos Playwright (`tests/{e2e,performance,security,regression}/`) escritos y
  corregidos contra el código real — **no ejecutados** en ninguna sesión todavía
  (`CLAUDE.md` §11 prohíbe correr navegador en la sesión que los escribió; el equipo
  debe correrlos con `npx playwright install` + credenciales de prueba reales).
- `tests/MANUAL_CHECKLIST.md`: checklist para verificación humana en navegador real.

### Fase 8 — Deploy final
- Merge de fases 5-7 a `main`, tag `v0.5.0-complete`.
- `docs/DEPLOYMENT.md`: instrucciones reales para desplegar en Vercel — **no hay
  evidencia en este repo de un deploy activo confirmado** (sin `vercel.json`/`.vercel/`
  ni ninguna otra señal de que se haya conectado el proyecto a Vercel todavía).

### Métricas de este cierre

| Métrica | Valor real | Objetivo |
|---|---|---|
| Tests | 323/323 passed | — |
| Cobertura (statements, módulos con test) | 95.1% | — |
| Performance OCR (Fase 4e, factura sintética representativa) | 4849.2 ms | <5000 ms |
| Reproducibilidad | 100% | 100% |
| Campos extraídos (RF-003) | 6/6 | 6 |
| Accuracy del modelo activo (62 clases, split sintético propio) | 16.1% | — (v1, sin datos reales) |

### Pendiente (no parte de este release)

- Etiquetado de caracteres reales de facturas Mansor y reentrenamiento (Andres &
  Santiago, `/ocr-lab/train`).
- Ejecución real de la suite Playwright (requiere navegador + credenciales de prueba).
- Confirmar/realizar el deploy real a Vercel (ver `docs/DEPLOYMENT.md`).
- RF-006 (integración contable) sigue `DEFERRED`, sin implementación ni mock.

## [v0.4.0-ocr] — 2026-08-12

Fases 4a-4f integradas a `main`: pipeline OCR propio completo (preprocesamiento,
segmentación, HOG + kNN propios, entrenamiento sintético, extracción de 6 campos,
evaluación) — sin ningún modelo activado todavía en este punto (eso pasó en Fase 5).
Ver `docs/ocr/evaluation.md` para las corridas de validación de esta fase (datos
sintéticos triviales, usados para confirmar que la aritmética de evaluación era
correcta, no como accuracy representativa).
