# CLAUDE.md

Este archivo es la fuente de verdad persistente del proyecto para cualquier sesión de
Claude Code que trabaje en este repositorio. **Debe releerse antes de cualquier cambio
importante en fases futuras.** Si algo en este archivo entra en conflicto con una
instrucción puntual del usuario, se detiene el trabajo y se pregunta — no se asume.

---

## 1. Identidad del proyecto

**Título:** Implementación de un sistema de digitalización de documentos físicos para
optimizar la gestión financiera en la empresa Mansor.

**Tipo:** Proyecto de grado — Ingeniería de Software.

**Empresas:** Mansor (cliente/dueño del proceso de negocio) + NETRIX Corporation
(acompañamiento técnico).

**Repositorio oficial:** `https://github.com/otpvayne/Tesis.git` (remote `origin`).

**Calendario:** no hay fecha de entrega fija. El ritmo lo define el equipo. Esto NO es
licencia para comprimir el proceso de fases — el gate de aprobación por fase se respeta
siempre, sin excepción por presión de tiempo (no existe tal presión).

## 2. Equipo

Usar exclusivamente estos nombres para este proyecto:

- **Diego Alejandro Medina Martinez** — Tech Lead / NETRIX Corporation
- **Andres Felipe Moreno Beltrán** — Desarrollador, Mansor
- **Santiago Moralez Orozco** — Desarrollador, Mansor

Somos tres personas trabajando sobre el mismo repositorio. Antes de modificar cualquier
archivo: `git status`, `git branch`, `git remote -v`. Si hay cambios locales no
reconocidos, DETENERSE e informar "CAMBIOS EXTERNOS DETECTADOS" con la lista de
archivos — nunca sobrescribir.

## 3. Regla de ejecución por fases (obligatoria, sin excepciones)

El proyecto avanza por fases. **Nunca** se pasa de una fase a la siguiente sin
aprobación explícita del usuario con el texto: `"APROBAR FASE X. EJECUTAR FASE X+1."`
(o, si aplica integración a `main`: `"APROBAR FASE X. INTEGRAR A MAIN Y EJECUTAR FASE
X+1."`).

Al terminar cada fase se reporta:

1. Qué se implementó
2. Archivos creados
3. Archivos modificados
4. Decisiones técnicas tomadas
5. RF y RNF cubiertos
6. Pruebas ejecutadas
7. Resultado de las pruebas
8. Problemas encontrados
9. Deuda técnica detectada
10. Pendientes
11. Propuesta para la siguiente fase

Más evidencia Git (rama, commits, último commit, estado del push, archivos principales).
Cierre exacto:

```
FASE X FINALIZADA.
RAMA PUBLICADA EN GITHUB.
ESPERANDO APROBACIÓN PARA MERGE Y CONTINUAR.
```

Si un problema arquitectónico obliga a modificar un requerimiento: NO modificarlo en
silencio. Detenerse y reportar REQUERIMIENTO AFECTADO / PROBLEMA / CAUSA / IMPACTO /
PROPUESTA DE CAMBIO / TRAZABILIDAD AFECTADA, y esperar autorización.

### Ramas por fase

`main` (solo versiones estables aprobadas) +
`fase/0-planificacion`, `fase/1-base-tecnica`, `fase/2-documentos`, `fase/3-camara`,
`fase/4a-ocr-preprocesamiento`, `fase/4b-ocr-segmentacion`, `fase/4c-ocr-clasificacion`,
`fase/4d-ocr-training`, `fase/4e-ocr-pipeline`, `fase/4f-ocr-evaluation`,
`fase/5-validacion`, `fase/6-administracion`, `fase/7-testing`, `fase/8-deployment`,
`fase/9-documentacion`. `feature/nombre` solo para aislar trabajo puntual dentro de una
fase.

Commits: Conventional Commits (`feat(scope): ...`, `fix`, `test`, `docs`, `refactor`,
`chore`), unidades pequeñas y coherentes. Nunca `--force` sin autorización explícita.
Nunca reescribir historial compartido. Tags solo al integrar una fase importante a
`main` (`v0.1.0-foundation`, `v0.2.0-documents`, ..., `v1.0.0`).

### Procedimiento de integración a `main` (al recibir "APROBAR FASE X. INTEGRAR A MAIN...")

1. `git status` en la rama de la fase — confirmar árbol limpio, sin cambios externos no
   reconocidos (si los hay: DETENERSE e informar "CAMBIOS EXTERNOS DETECTADOS").
2. `git fetch origin` y confirmar que la rama de la fase está sincronizada con
   `origin/<rama>` (sin commits locales ni remotos pendientes de traer).
3. Integrar a `main`:
   - Si `main` no existe todavía, crearla desde la rama de la fase (no hay conflicto
     posible — es la primera integración).
   - Si `main` ya existe, traer `origin/main`, hacer merge de la rama de la fase sobre
     `main` (fast-forward si es posible; si hay conflictos, resolverlos preservando el
     trabajo de ambas partes, nunca descartando cambios sin analizarlos).
4. `git push` de `main` al remoto.
5. Crear la siguiente rama de fase (`fase/N+1-nombre`) desde el `main` ya actualizado.
6. Tag solo si la fase integrada corresponde a un hito de versión (ver convención de
   tags arriba) — no en cada integración.
7. Reportar rama, commits, último commit y estado del push como en cualquier cierre de
   fase (§3 arriba).

La rama de la fase ya integrada no se borra automáticamente — queda como evidencia
histórica salvo que el equipo pida explícitamente eliminarla.

## 4. Alcance

Aplicación **web** únicamente (Next.js). No React Native / Expo / apps nativas. Mobile
first, funcional en desktop, tablet, Android e iPhone vía navegador. Cámara vía
`navigator.mediaDevices.getUserMedia()` con fallback `<input type="file"
accept="image/jpeg,image/png" capture="environment">`. Formatos: JPG, JPEG, PNG. **No
PDF en v1.** No PWA todavía (marcar decisiones que la afectarían como `FUTURE-PWA`, sin
bloquearla). No modo offline.

## 5. Stack

- Next.js + TypeScript (modo `strict`, evitar `any`; si se usa, comentar por qué) + React
- Supabase: PostgreSQL, **Supabase Auth nativo** (sin Clerk ni proveedores externos),
  Supabase Storage (bucket privado)
- Vercel (deploy)

Server Components / Client Components / Route Handlers solo donde aporte — no todo es
`"use client"`. Versiones estables vigentes se fijan y registran en `README.md` al
bootstrap técnico (Fase 1), no antes.

## 6. Roles y seguridad

Dos roles: **USER** y **ADMIN**. USER solo ve/gestiona sus propios documentos. ADMIN ve
todo, gestiona modelos OCR y datasets, y accede a auditoría global.

La seguridad **no depende del frontend**. Aislamiento de datos garantizado por **Row
Level Security en PostgreSQL/Supabase**, nunca solo ocultando UI. `SUPABASE_SERVICE_ROLE_KEY`
nunca se expone al navegador. HTTPS, validar MIME type y tamaño de archivo, no confiar
en nombres de archivo del cliente, sin secretos en Git. Storage: bucket privado, ruta
`{user_id}/{document_id}/original.{extension}`, URLs firmadas para visualización.

## 7. Regla absoluta del OCR

**El motor OCR se desarrolla desde cero por el equipo.** Prohibido: Tesseract /
Tesseract.js, OpenCV / OpenCV.js, EasyOCR, PaddleOCR, Google Vision, Google Document AI,
AWS Textract, Azure Computer Vision, OCR.space, ABBYY, TensorFlow / TensorFlow.js,
PyTorch, ONNX Runtime, ML Kit, transformers OCR, modelos preentrenados, APIs/servicios
OCR de terceros, librerías que hagan segmentación o reconocimiento automático, librerías
de computer vision que resuelvan el pipeline por nosotros, modelos descargados de
terceros.

Permitido: TypeScript/JavaScript estándar, Canvas API, ImageData, `createImageBitmap`,
FileReader, Web Workers, TypedArray, `Math`, APIs estándar del navegador, librerías
generales que NO implementen procesamiento OCR (utilidades genéricas, testing, etc.).
Cualquier algoritmo conocido (Otsu, HOG, kNN, morfología, componentes conectados, etc.)
se implementa por el equipo desde su definición matemática — nunca importando la
implementación de un tercero.

Clasificador: **HOG propio** + **kNN propio**, documentados con fórmulas en
`docs/ocr/algorithms.md`. Perfiles OCR (`OCRDocumentProfile`) — por ahora solo
`invoice_es`, primer modelo `invoice_es_v1`. Tipos futuros: solo identificadores
temporales `future_document_type_2/3/4`, sin inventar campos ni reglas. Dataset y
entrenamiento vía herramienta propia **OCR LAB** (solo admin). Split
train/validation/test estricto — `test` nunca se usa para entrenar; resultados
reportados solo de `test`. Caracteres iniciales: `0-9 A-Z a-z`; acentos y signos se
evalúan después, sin ampliar el alfabeto sin medir necesidad. Confidence score siempre
calculado desde información real del pipeline (nunca aleatorio), fórmula documentada.
Procesamiento intensivo en **Web Worker**, con estados de progreso reales (nunca
progreso falso basado en timers).

## 8. Requerimientos

**Funcionales:** RF-001 Captura · RF-002 OCR propio · RF-003 Extracción de campos
(obligatorio: proveedor, fecha, monto_total; deseado: numero_factura; sin líneas de
producto) · RF-004 Almacenamiento (Supabase) · RF-005 Consulta con filtros · RF-006
Integración contable — **DEFERRED**, no implementar SIIGO ni mocks presentados como
reales · RF-007 Validación humana (con trazabilidad de original vs. validado).

**No funcionales:** RNF-001 Rendimiento (<5s objetivo, medir con `processing_ms`, nunca
afirmar sin medir) · RNF-002 Usabilidad (≤3 interacciones para iniciar digitalización) ·
RNF-003 Seguridad · RNF-004 Portabilidad (responsive, navegadores modernos) · RNF-005
Disponibilidad (Vercel + Supabase, sin afirmar SLA no medido) · RNF-006
Interoperabilidad (interfaces preparadas, sin integración ficticia) · RNF-007 Hardware
(cámara, permisos, contexto seguro, Canvas/ImageData) · RNF-008 Escalabilidad (sin
estado global innecesario, consultas paginadas, OCR no bloqueante).

Matriz completa y estado real: `docs/requirements/traceability.md`.

## 9. Convenciones de calidad

SOLID cuando aporte valor, DRY sin abstracciones prematuras, alta cohesión / bajo
acoplamiento, dependency inversion para módulos externos, tipado estricto, manejo
explícito de errores, validación en los límites del sistema. Evitar: god
classes/components, duplicación, números mágicos, archivos gigantes, estado global
innecesario, dependencias circulares, sobrearquitectura. TSDoc/JSDoc en interfaces
públicas, servicios, algoritmos OCR, funciones matemáticas, Web Workers y adaptadores de
persistencia — comentarios explican el POR QUÉ, no el QUÉ.

## 10. Testing

Separar unit / integration / e2e / OCR benchmark. Prioridad máxima en unit tests con
matrices pequeñas y resultado calculable a mano para: grayscale, histograma, Otsu,
binarización, morfología, componentes conectados, segmentación, HOG, distancias, kNN,
confidence, extracción de campos. Las pruebas OCR "reales" usan siempre la partición
`test`. Detalle: `docs/testing/test-plan.md`.

## 11. Prohibido siempre

Force push sin autorización explícita, eliminar ramas de otros, reescribir commits
ajenos, `git reset --hard` sobre trabajo no confirmado, `git clean -fd` sin
autorización, borrar archivos no reconocidos, subir secretos/datos privados/facturas
reales de Mansor, merge a `main` sin aprobación, commits vacíos, modificar autoría de
commits existentes, PDF en v1, PWA/offline en v1, integración contable real o simulada
como real, cualquier dependencia OCR/CV/ML de terceros listada en la sección 7,
expandir el alcance de RF-003/RF-006/perfiles OCR sin autorización explícita.

## 12. Estado actual

Fase activa: **Fase 0 — Planificación y arquitectura.** Ver `docs/roadmap.md` para el
plan de fases siguientes y `docs/requirements/traceability.md` para el estado por
requerimiento.
